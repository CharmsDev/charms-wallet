import { useState, useCallback, useMemo } from 'react';
import { useUTXOs } from '@/stores/utxoStore';
import { useNetwork } from '@/contexts/NetworkContext';
import { useCharms } from '@/stores/charmsStore';
import { formatBTC } from '@/utils/formatters';

// ─── Steps ───────────────────────────────────────────────────────────
const STEP = {
  FORM: 'form',
  PREPARING: 'preparing',
  CONFIRM: 'confirm',
  BROADCASTING: 'broadcasting',
  SUCCESS: 'success',
};

// ─── Helpers ─────────────────────────────────────────────────────────
const formatSats = (n) => {
  try { return Number(n).toLocaleString('en-US'); } catch (_) { return String(n); }
};

const QUICK_AMOUNTS = [3000, 10000, 50000, 100000];

// ─── Component ───────────────────────────────────────────────────────
export default function SendScreen({ onClose }) {
  const { utxos, totalBalance, updateAfterTransaction, loadUTXOs, refreshSpecificAddresses } = useUTXOs();
  const { activeBlockchain, activeNetwork } = useNetwork();
  const { charms } = useCharms();

  // ── Asset selector (BTC / BRO — BRO disabled for now) ──
  const [selectedAsset, setSelectedAsset] = useState('btc');

  // ── Form state ──
  const [destinationAddress, setDestinationAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState(STEP.FORM);
  const [statusMessage, setStatusMessage] = useState('');

  // ── Transaction data (populated after preparation) ──
  const [txData, setTxData] = useState(null);
  const [txId, setTxId] = useState(null);

  // ── Detail toggles ──
  const [showDecodedTx, setShowDecodedTx] = useState(false);
  const [showUtxoList, setShowUtxoList] = useState(false);
  const [showRawHex, setShowRawHex] = useState(false);

  // ── Copied states ──
  const [copiedHex, setCopiedHex] = useState(false);
  const [copiedTxId, setCopiedTxId] = useState(false);

  // ── Fee rate from network ──
  const [feeRate, setFeeRate] = useState(null);
  const [isCalculatingMax, setIsCalculatingMax] = useState(false);

  // ── Validation ──
  const amountNum = parseInt(amount) || 0;
  const isAddressValid = useMemo(() => {
    const addr = (destinationAddress || '').trim();
    if (addr.length < 26) return false;
    if (activeNetwork === 'mainnet') return addr.startsWith('bc1');
    return addr.startsWith('tb1') || addr.startsWith('bcrt1');
  }, [destinationAddress, activeNetwork]);
  const isAmountValid = amountNum >= 546;
  const canSubmit = isAddressValid && isAmountValid;

  // ── Max amount calculation ──
  const handleMaxAmount = useCallback(async () => {
    setIsCalculatingMax(true);
    setError('');
    try {
      const { bitcoinApiRouter } = await import('@/services/shared/bitcoin-api-router');
      const feeEstimates = await bitcoinApiRouter.getFeeEstimates(activeNetwork);
      if (!feeEstimates.success) throw new Error('Failed to fetch fee estimates');
      const currentFeeRate = feeEstimates.fees.halfHour;
      setFeeRate(currentFeeRate);

      const { utxoCalculations } = await import('@/services/utxo/utils/calculations');
      const spendableUtxos = utxoCalculations.getSpendableUtxos(utxos, charms);
      const allUtxos = Object.entries(spendableUtxos).flatMap(([address, list]) =>
        list.map(u => ({ ...u, address }))
      );

      if (allUtxos.length === 0) { setAmount('0'); return; }

      const { UTXOSelector } = await import('@/services/utxo/core/selector');
      const selector = new UTXOSelector();
      const totalValue = allUtxos.reduce((sum, u) => sum + u.value, 0);
      const exactFee = selector.calculateMixedFee(allUtxos, 1, currentFeeRate);
      const maxAmount = totalValue - exactFee;
      setAmount(maxAmount > 0 ? maxAmount.toString() : '0');
    } catch (err) {
      setError(err.message || 'Failed to calculate max amount');
      setAmount('0');
    } finally {
      setIsCalculatingMax(false);
    }
  }, [utxos, charms, activeNetwork]);

  // ── Prepare transaction (UTXO selection → sign → show confirmation) ──
  const handlePrepare = useCallback(async () => {
    if (!canSubmit) return;
    setError('');
    setStep(STEP.PREPARING);
    setStatusMessage('Fetching network fee rates...');

    try {
      // 1. Fee estimation
      const { bitcoinApiRouter } = await import('@/services/shared/bitcoin-api-router');
      const feeEstimates = await bitcoinApiRouter.getFeeEstimates(activeNetwork);
      if (!feeEstimates.success) throw new Error('Failed to fetch fee estimates');
      const currentFeeRate = feeEstimates.fees.halfHour;
      setFeeRate(currentFeeRate);

      // 2. Get spendable UTXOs
      setStatusMessage('Selecting UTXOs...');
      const { utxoCalculations } = await import('@/services/utxo/utils/calculations');
      const spendableUtxos = utxoCalculations.getSpendableUtxos(utxos, charms);
      const allUtxos = Object.entries(spendableUtxos).flatMap(([address, list]) =>
        list.map(u => ({ ...u, address }))
      );

      if (allUtxos.length === 0) throw new Error('No spendable UTXOs available.');

      const amountInSats = parseInt(amount, 10);

      // 3. UTXO selection
      const { UTXOSelector } = await import('@/services/utxo/core/selector');
      const selector = new UTXOSelector();

      const totalAvailable = allUtxos.reduce((sum, u) => sum + u.value, 0);
      const isMaxTransaction = amountInSats >= (totalAvailable - 1000);

      let selectionResult;
      if (isMaxTransaction) {
        const exactFee = selector.calculateMixedFee(allUtxos, 1, currentFeeRate);
        const adjustedAmount = totalAvailable - exactFee;
        selectionResult = {
          selectedUtxos: allUtxos,
          totalSelected: totalAvailable,
          estimatedFee: exactFee,
          change: 0,
          adjustedAmount,
          feeRate: currentFeeRate,
        };
      } else {
        selectionResult = await selector.selectUtxosForAmountDynamic(
          allUtxos, amountInSats, currentFeeRate, null, updateAfterTransaction,
          'bitcoin', activeNetwork
        );
        selectionResult.feeRate = currentFeeRate;
      }

      if (!selectionResult.selectedUtxos || selectionResult.selectedUtxos.length === 0) {
        throw new Error('Insufficient funds for this transaction.');
      }

      // 4. Create & sign transaction
      setStatusMessage('Signing transaction...');
      const { BitcoinTransactionOrchestrator } = await import('@/services/bitcoin/transaction-orchestrator');
      const orchestrator = new BitcoinTransactionOrchestrator(activeNetwork);

      const result = await orchestrator.processTransaction(
        destinationAddress,
        selectionResult.adjustedAmount || amountInSats,
        selectionResult.selectedUtxos,
        currentFeeRate,
        updateAfterTransaction
      );

      if (!result.success) throw new Error(result.error || 'Transaction signing failed');

      // 5. Decode transaction for inspection
      setStatusMessage('Decoding transaction...');
      let decodedTx = null;
      try {
        const { decodeTx } = await import('@/lib/bitcoin/txDecoder');
        decodedTx = decodeTx(result.signedTxHex, activeNetwork);
      } catch (_) { /* non-critical */ }

      const precalculated = {
        selectedUtxos: selectionResult.selectedUtxos,
        totalSelected: selectionResult.totalSelected,
        estimatedFee: selectionResult.estimatedFee,
        change: selectionResult.change,
        adjustedAmount: selectionResult.adjustedAmount || amountInSats,
        feeRate: currentFeeRate,
        destinationAddress,
        originalAmount: amountInSats,
        txHex: result.signedTxHex,
        txid: result.txid,
        decodedTx,
      };

      setTxData(precalculated);
      setStep(STEP.CONFIRM);

    } catch (err) {
      setError(err.message || 'Transaction preparation failed');
      setStep(STEP.FORM);
    }
  }, [canSubmit, amount, destinationAddress, utxos, charms, activeNetwork, updateAfterTransaction]);

  // ── Broadcast ──
  const handleBroadcast = useCallback(async () => {
    if (!txData) return;
    setError('');
    setStep(STEP.BROADCASTING);
    setStatusMessage('Verifying UTXOs before broadcast...');

    try {
      // 1. Verify UTXOs are still unspent
      const { bitcoinApiRouter } = await import('@/services/shared/bitcoin-api-router');
      const verifications = await Promise.allSettled(
        txData.selectedUtxos.map(async (utxo) => {
          const isSpent = await bitcoinApiRouter.isUtxoSpent(utxo.txid, utxo.vout, activeNetwork);
          return { utxo: `${utxo.txid}:${utxo.vout}`, isSpent, value: utxo.value };
        })
      );

      const spentUtxos = verifications
        .filter(r => r.status === 'fulfilled' && r.value.isSpent)
        .map(r => r.value);

      if (spentUtxos.length > 0) {
        const spentList = spentUtxos.map(s => {
          const [txid, vout] = s.utxo.split(':');
          return { txid, vout: parseInt(vout) };
        });
        await updateAfterTransaction(spentList, {}, 'bitcoin', activeNetwork);
        throw new Error(`${spentUtxos.length} UTXO(s) were already spent. Wallet refreshed.`);
      }

      // 2. Broadcast
      setStatusMessage('Broadcasting transaction...');
      const { BitcoinTransactionOrchestrator } = await import('@/services/bitcoin/transaction-orchestrator');
      const orchestrator = new BitcoinTransactionOrchestrator(activeNetwork);
      const broadcastResult = await orchestrator.broadcastService.broadcastTransaction(txData.txHex, activeNetwork);

      if (!broadcastResult.success) throw new Error(broadcastResult.error || 'Broadcast failed');

      // 3. Update UTXO state immediately
      setStatusMessage('Updating wallet...');
      await updateAfterTransaction(txData.selectedUtxos, {}, 'bitcoin', activeNetwork);

      setTxId(broadcastResult.txid);
      setStep(STEP.SUCCESS);

      // 4. Background refresh (non-blocking)
      (async () => {
        try {
          // Collect unique addresses involved
          const involvedAddresses = [
            ...new Set(txData.selectedUtxos.map(u => u.address).filter(Boolean))
          ];
          if (involvedAddresses.length > 0) {
            await refreshSpecificAddresses(involvedAddresses, activeBlockchain, activeNetwork);
          }
          await loadUTXOs(activeBlockchain, activeNetwork);
        } catch (_) { /* silent */ }
      })();

    } catch (err) {
      if (err.message?.includes('bad-txns-inputs-missingorspent') && txData?.selectedUtxos) {
        await updateAfterTransaction(txData.selectedUtxos, {}, 'bitcoin', activeNetwork);
        setError('UTXOs were spent by another transaction. Wallet refreshed.');
      } else {
        setError(err.message || 'Broadcast failed');
      }
      setStep(STEP.CONFIRM);
    }
  }, [txData, activeNetwork, activeBlockchain, updateAfterTransaction, refreshSpecificAddresses, loadUTXOs]);

  // ── Cancel (returns to form, except during/after broadcast) ──
  const handleCancel = useCallback(() => {
    if (step === STEP.BROADCASTING || step === STEP.SUCCESS) return;
    setTxData(null);
    setError('');
    setStep(STEP.FORM);
  }, [step]);

  // ── Close after success ──
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // ── Copy helpers ──
  const copyToClipboard = useCallback((text, setter) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2500);
  }, []);

  // ── Mempool URL ──
  const mempoolTxUrl = useMemo(() => {
    const base = activeNetwork === 'mainnet' ? 'https://mempool.space' : 'https://mempool.space/testnet4';
    return txId ? `${base}/tx/${txId}` : null;
  }, [activeNetwork, txId]);

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-dark-950">
      {/* Header */}
      <header className="glass-effect flex items-center justify-between px-4 py-3 border-b border-dark-700">
        {step !== STEP.SUCCESS && step !== STEP.BROADCASTING ? (
          <button
            onClick={step === STEP.CONFIRM ? handleCancel : onClose}
            className="flex items-center gap-1 text-dark-300 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm">{step === STEP.CONFIRM ? 'Back' : 'Cancel'}</span>
          </button>
        ) : (
          <div className="w-16" />
        )}
        <span className="font-semibold gradient-text">Send</span>
        <div className="w-16" />
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">

        {/* ═══════ STEP: FORM ═══════ */}
        {step === STEP.FORM && (
          <div className="space-y-4">
            {/* Asset Selector */}
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedAsset('btc')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  selectedAsset === 'btc'
                    ? 'bg-gradient-to-r from-bitcoin-500 to-orange-600 text-white shadow-lg'
                    : 'bg-dark-800 border border-dark-600 text-dark-400 hover:text-dark-300'
                }`}
              >
                Bitcoin
              </button>
              <button
                onClick={() => setSelectedAsset('bro')}
                disabled
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-dark-800 border border-dark-600 text-dark-500 cursor-not-allowed opacity-50"
                title="Coming soon"
              >
                $BRO (soon)
              </button>
            </div>

            {/* Available Balance */}
            <div className="card p-3 flex items-center justify-between">
              <span className="text-xs text-dark-400">Available Balance</span>
              <span className="text-sm font-bold gradient-text">{formatBTC(totalBalance)} BTC</span>
            </div>

            {/* Destination Address */}
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1.5">Destination Address</label>
              <input
                type="text"
                value={destinationAddress}
                onChange={(e) => setDestinationAddress(e.target.value)}
                className="w-full px-3 py-3 bg-dark-800 border border-dark-600 rounded-xl text-sm text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all font-mono"
                placeholder="Enter Bitcoin address"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1.5">Amount (satoshis)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-3 bg-dark-800 border border-dark-600 rounded-xl text-sm text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                placeholder="Min 546 sats"
                min="546"
              />
              {/* Quick amounts + Max */}
              <div className="mt-2 flex gap-2 flex-wrap">
                {QUICK_AMOUNTS.map((q) => (
                  <button
                    key={q}
                    onClick={() => setAmount(q.toString())}
                    className="px-3 py-1.5 bg-dark-800 border border-dark-600 rounded-lg text-xs text-dark-300 hover:bg-dark-700 hover:text-white transition-colors"
                  >
                    {q.toLocaleString()}
                  </button>
                ))}
                <button
                  onClick={handleMaxAmount}
                  disabled={isCalculatingMax}
                  className="px-3 py-1.5 bg-bitcoin-600 hover:bg-bitcoin-500 border border-bitcoin-500 rounded-lg text-xs text-white font-medium transition-colors disabled:opacity-50 min-w-[48px] flex items-center justify-center"
                >
                  {isCalculatingMax ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : 'Max'}
                </button>
              </div>
            </div>

            {/* Fee rate display */}
            {feeRate && (
              <div className="flex items-center gap-2 text-xs text-dark-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Network fee: {feeRate} sat/vB
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-xl">
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}

            {/* Send Button */}
            <button
              onClick={handlePrepare}
              disabled={!canSubmit}
              className={`w-full py-3.5 rounded-xl text-sm font-semibold transition-all ${
                canSubmit
                  ? 'bg-gradient-to-r from-bitcoin-500 to-orange-600 text-white hover:shadow-lg hover:shadow-bitcoin-500/25'
                  : 'bg-dark-700 text-dark-500 cursor-not-allowed'
              }`}
            >
              Review Transaction
            </button>
          </div>
        )}

        {/* ═══════ STEP: PREPARING ═══════ */}
        {step === STEP.PREPARING && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 border-3 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-dark-300 text-center">{statusMessage}</p>
            <button
              onClick={handleCancel}
              className="mt-6 text-xs text-dark-500 hover:text-dark-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ═══════ STEP: CONFIRM ═══════ */}
        {step === STEP.CONFIRM && txData && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-white">Confirm Transaction</h2>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-2">
              <div className="card p-3 text-center">
                <div className="text-[10px] text-dark-500 uppercase tracking-wide mb-1">Sending</div>
                <div className="text-sm font-bold text-primary-400">{formatSats(txData.adjustedAmount)} <span className="text-[10px] font-normal text-dark-400">sats</span></div>
              </div>
              <div className="card p-3 text-center">
                <div className="text-[10px] text-dark-500 uppercase tracking-wide mb-1">Fee</div>
                <div className="text-sm font-bold text-orange-400">{formatSats(txData.estimatedFee)} <span className="text-[10px] font-normal text-dark-400">sats</span></div>
                <div className="text-[10px] text-dark-500">{txData.feeRate} sat/vB</div>
              </div>
              <div className="card p-3 text-center">
                <div className="text-[10px] text-dark-500 uppercase tracking-wide mb-1">Change</div>
                <div className="text-sm font-bold text-green-400">{formatSats(txData.change)} <span className="text-[10px] font-normal text-dark-400">sats</span></div>
              </div>
            </div>

            {/* Destination */}
            <div className="card p-3">
              <div className="text-[10px] text-dark-500 uppercase tracking-wide mb-1">To</div>
              <p className="text-xs font-mono text-white break-all leading-relaxed">{txData.destinationAddress}</p>
            </div>

            {/* ── Collapsible: Raw Hex ── */}
            <button
              onClick={() => setShowRawHex(!showRawHex)}
              className="w-full flex items-center justify-between text-xs text-primary-400 hover:text-primary-300 transition-colors"
            >
              <span>{showRawHex ? 'Hide' : 'Show'} Raw Transaction Hex</span>
              <svg className={`w-4 h-4 transition-transform ${showRawHex ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showRawHex && txData.txHex && (
              <div className="card p-3 relative">
                <pre className="text-[10px] font-mono text-dark-300 break-all whitespace-pre-wrap max-h-32 overflow-auto leading-relaxed">{txData.txHex}</pre>
                <button
                  onClick={() => copyToClipboard(txData.txHex, setCopiedHex)}
                  className="absolute top-2 right-2 text-[10px] text-dark-400 hover:text-white transition-colors bg-dark-800 px-2 py-1 rounded"
                >
                  {copiedHex ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}

            {/* ── Collapsible: Decoded TX ── */}
            {txData.decodedTx && (
              <>
                <button
                  onClick={() => setShowDecodedTx(!showDecodedTx)}
                  className="w-full flex items-center justify-between text-xs text-primary-400 hover:text-primary-300 transition-colors"
                >
                  <span>{showDecodedTx ? 'Hide' : 'Show'} Decoded Transaction</span>
                  <svg className={`w-4 h-4 transition-transform ${showDecodedTx ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showDecodedTx && (
                  <div className="card p-3">
                    <pre className="text-[10px] font-mono text-dark-300 break-all whitespace-pre-wrap max-h-48 overflow-auto leading-relaxed">
                      {JSON.stringify(txData.decodedTx, null, 2)}
                    </pre>
                  </div>
                )}
              </>
            )}

            {/* ── Collapsible: UTXOs used ── */}
            {txData.selectedUtxos?.length > 0 && (
              <>
                <button
                  onClick={() => setShowUtxoList(!showUtxoList)}
                  className="w-full flex items-center justify-between text-xs text-primary-400 hover:text-primary-300 transition-colors"
                >
                  <span>{showUtxoList ? 'Hide' : 'Show'} UTXOs ({txData.selectedUtxos.length})</span>
                  <svg className={`w-4 h-4 transition-transform ${showUtxoList ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showUtxoList && (
                  <div className="card max-h-40 overflow-auto divide-y divide-dark-700">
                    {txData.selectedUtxos.map((u, i) => (
                      <div key={`${u.txid}:${u.vout}-${i}`} className="px-3 py-2 flex items-center justify-between">
                        <span className="text-[10px] font-mono text-dark-400 truncate mr-2" title={`${u.txid}:${u.vout}`}>
                          {u.txid.slice(0, 12)}...:{u.vout}
                        </span>
                        <span className="text-[10px] text-white whitespace-nowrap">{formatSats(u.value)} sats</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-xl">
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCancel}
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-dark-800 border border-dark-600 text-dark-300 hover:bg-dark-700 hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleBroadcast}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg hover:shadow-green-500/25 transition-all"
              >
                Confirm & Send
              </button>
            </div>
          </div>
        )}

        {/* ═══════ STEP: BROADCASTING ═══════ */}
        {step === STEP.BROADCASTING && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 border-3 border-green-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-dark-300 text-center">{statusMessage}</p>
            <p className="text-xs text-dark-500 mt-2">Do not close this window</p>
          </div>
        )}

        {/* ═══════ STEP: SUCCESS ═══════ */}
        {step === STEP.SUCCESS && (
          <div className="flex flex-col items-center pt-6">
            {/* Check icon */}
            <div className="relative w-16 h-16 mb-4">
              <div className="absolute inset-0 bg-green-500/20 rounded-full animate-pulse" />
              <div className="relative flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            <h2 className="text-lg font-bold text-white mb-1">Transaction Sent!</h2>
            <p className="text-xs text-dark-400 mb-5">Successfully broadcast to the network</p>

            {/* Summary */}
            <div className="w-full space-y-3 mb-5">
              <div className="card p-3 flex items-center justify-between">
                <span className="text-xs text-dark-400">Amount</span>
                <span className="text-sm font-bold text-bitcoin-400">{formatSats(txData?.adjustedAmount || 0)} sats</span>
              </div>
              <div className="card p-3 flex items-center justify-between">
                <span className="text-xs text-dark-400">Fee</span>
                <span className="text-sm font-medium text-dark-300">{formatSats(txData?.estimatedFee || 0)} sats</span>
              </div>
              <div className="card p-3">
                <div className="text-xs text-dark-400 mb-1">Transaction ID</div>
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-mono text-white break-all flex-1">{txId}</p>
                  <button
                    onClick={() => copyToClipboard(txId, setCopiedTxId)}
                    className="text-[10px] text-dark-400 hover:text-white transition-colors flex-shrink-0"
                  >
                    {copiedTxId ? '✓' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="w-full space-y-2">
              {mempoolTxUrl && (
                <a
                  href={mempoolTxUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 rounded-xl text-sm font-medium bg-dark-800 border border-dark-600 text-primary-400 hover:bg-dark-700 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  View on Mempool
                </a>
              )}
              <button
                onClick={handleClose}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary-500 to-blue-500 text-white hover:shadow-lg transition-all"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
