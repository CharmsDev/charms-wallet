/**
 * SendCharmScreen
 *
 * UI for transferring charm tokens (BRO) using the v10 Charms protocol.
 *
 * Flow:
 * 1. User picks token, enters recipient + amount
 * 2. "Preview" validates inputs and shows confirmation
 * 3. "Send" → prover (5-10 min ZK proof) → sign → broadcast via Explorer API
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNetwork } from '@/contexts/NetworkContext';
import { useCharms } from '@/stores/charmsStore';
import { useAddresses } from '@/stores/addressesStore';
import { useUTXOs } from '@/stores/utxoStore';
import { useExtensionWalletSync } from '../hooks/useExtensionWalletSync';

const TOKEN_DECIMALS = 100_000_000; // BRO has 8 decimals

const STEP = {
  FORM: 'form',
  PROVING: 'proving',
  CONFIRM: 'confirm',
  SUCCESS: 'success',
};

const BRO_IMAGE = 'https://bro.charms.dev/assets/bro-token-DsXLIv23.jpg';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toRaw(displayAmount, decimals = TOKEN_DECIMALS) {
  return Math.round(parseFloat(displayAmount) * decimals);
}

function toDisplay(rawAmount, decimals = TOKEN_DECIMALS) {
  return (rawAmount / decimals).toFixed(2);
}

function shortenAddr(addr) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SendCharmScreen({ onClose, syncAfterSend }) {
  const { activeNetwork } = useNetwork();
  const { charms } = useCharms();
  const { addresses } = useAddresses();
  const { isSyncing, syncFullWallet } = useExtensionWalletSync();
  const { utxos: btcUtxosByAddress } = useUTXOs();

  // Build address lookup: address string → { index, isChange }
  const addrLookup = useMemo(() => {
    const map = {};
    for (const a of (addresses || [])) {
      map[a.address] = { index: a.index ?? 0, isChange: a.isChange ?? false };
    }
    return map;
  }, [addresses]);

  // Set of charm UTXO keys ("txid:vout") — to exclude from funding selection
  const charmUtxoKeys = useMemo(() => {
    const keys = new Set();
    const list = Array.isArray(charms) ? charms : Object.values(charms || {}).flat();
    for (const c of list) {
      if (c.txid) keys.add(`${c.txid}:${c.outputIndex ?? 0}`);
    }
    return keys;
  }, [charms]);

  // ── Derive available tokens from charms store ──
  const tokenBalances = useMemo(() => {
    if (!charms) return [];
    const map = {};
    // charms is a flat array of charm objects
    const list = Array.isArray(charms) ? charms : Object.values(charms).flat();
    for (const charm of list) {
      const appId = charm.appId || charm.app_id;
      if (!appId) continue;
      // Only tokens (not NFTs)
      if (charm.type === 'nft') continue;
      if (!map[appId]) {
        map[appId] = {
          appId,
          symbol: charm.ticker || charm.name || '?',
          totalRaw: 0,
          utxos: [],
        };
      }
      const rawAmt = charm.amount || 0;
      map[appId].totalRaw += rawAmt;
      if (charm.txid) {
        const addrInfo = addrLookup[charm.address] || { index: 0, isChange: false };
        map[appId].utxos.push({
          utxoId: `${charm.txid}:${charm.outputIndex ?? 0}`,
          amount: rawAmt,
          address: charm.address,
          addressIndex: addrInfo.index,
          isChange: addrInfo.isChange,
        });
      }
    }
    return Object.values(map).filter(t => t.totalRaw > 0);
  }, [charms, addrLookup]);

  const defaultToken = tokenBalances[0] || null;

  // ── Form state ──
  const [selectedToken, setSelectedToken] = useState(defaultToken);
  const [recipient, setRecipient] = useState('');
  const [displayAmount, setDisplayAmount] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState(STEP.FORM);
  const [statusMessage, setStatusMessage] = useState('');
  const [txid, setTxid] = useState(null);
  const [copiedTxid, setCopiedTxid] = useState(false);

  // Phase 1 result — held until user confirms
  const [proverResult, setProverResult] = useState(null);
  const [inputSigningMapRef, setInputSigningMapRef] = useState(null);
  const [changeAddrRef, setChangeAddrRef] = useState(null);

  // Phase 2 — inline loading state within CONFIRM screen (no second spinner screen)
  const [confirming, setConfirming] = useState(false);

  // Symbol restored from storage when popup is reopened after proof completes
  const [confirmedSymbol, setConfirmedSymbol] = useState('');

  // ── Validation ──
  const rawAmount = useMemo(() => {
    const n = parseFloat(displayAmount);
    return isNaN(n) || n <= 0 ? 0 : toRaw(displayAmount);
  }, [displayAmount]);

  const maxRaw = selectedToken?.totalRaw ?? 0;

  const isAddressValid = useMemo(() => {
    const addr = (recipient || '').trim();
    if (addr.length < 26) return false;
    if (activeNetwork === 'mainnet') return addr.startsWith('bc1');
    return addr.startsWith('tb1') || addr.startsWith('bcrt1');
  }, [recipient, activeNetwork]);

  const isAmountValid = rawAmount > 0 && rawAmount <= maxRaw;
  const canSubmit = isAddressValid && isAmountValid && selectedToken;

  // ── Select charm UTXOs (greedy, largest-first, max 16) ──
  const selectCharmInputs = useCallback(() => {
    if (!selectedToken || rawAmount <= 0) return [];
    const sorted = [...selectedToken.utxos].sort((a, b) => b.amount - a.amount);
    const selected = [];
    let total = 0;
    for (const u of sorted) {
      if (total >= rawAmount || selected.length >= 16) break;
      selected.push(u);
      total += u.amount;
    }
    if (total < rawAmount) return []; // insufficient
    return selected;
  }, [selectedToken, rawAmount]);

  // ── Select funding UTXO (plain BTC, not a charm UTXO, largest available) ──
  const selectFundingUtxo = useCallback(() => {
    let best = null;
    for (const [address, utxoList] of Object.entries(btcUtxosByAddress || {})) {
      const addrInfo = addrLookup[address];
      if (!addrInfo) continue; // not our address
      for (const u of utxoList) {
        const key = `${u.txid}:${u.vout}`;
        if (charmUtxoKeys.has(key)) continue; // skip charm UTXOs
        if (u.value < 1000) continue; // too small
        if (!best || u.value > best.value) {
          best = {
            utxoId: key,
            value: u.value,
            address,
            addressIndex: addrInfo.index,
            isChange: addrInfo.isChange,
          };
        }
      }
    }
    return best;
  }, [btcUtxosByAddress, addrLookup, charmUtxoKeys]);

  // ── Restore CONFIRM state from a pending proof stored in chrome.storage ──
  const restoreConfirmState = useCallback((data) => {
    const prevTxMap = new Map(data.prevTxMapEntries || []);
    setProverResult({ spellTxHex: data.spellTxHex, prevTxMap, fee: data.fee });
    const meta = data.meta || {};
    if (meta.inputSigningMap) setInputSigningMapRef(meta.inputSigningMap);
    if (meta.displayAmount)   setDisplayAmount(meta.displayAmount);
    if (meta.recipient)       setRecipient(meta.recipient);
    if (meta.symbol)          setConfirmedSymbol(meta.symbol);
    setStep(STEP.CONFIRM);
  }, []);

  // ── On mount: check for a pending proof + listen for live background messages ──
  useEffect(() => {
    // Case: popup was closed while prover was running — restore state on reopen
    chrome.runtime.sendMessage({ type: 'GET_PENDING_PROOF' }, (response) => {
      if (chrome.runtime.lastError) return;
      const pp = response?.pendingProof;
      if (!pp) return;
      if (pp.status === 'ready') {
        restoreConfirmState(pp);
      } else if (pp.status === 'proving') {
        // Still running — show PROVING step with last known status
        const meta = pp.meta || {};
        if (meta.displayAmount) setDisplayAmount(meta.displayAmount);
        if (meta.recipient)     setRecipient(meta.recipient);
        if (meta.inputSigningMap) setInputSigningMapRef(meta.inputSigningMap);
        if (meta.symbol)        setConfirmedSymbol(meta.symbol);
        setStep(STEP.PROVING);
        setStatusMessage(response.provingStatus?.message || 'Generating ZK proof…');
      }
    });

    // Listen for live updates from background/offscreen
    const handleMessage = (message) => {
      if (message.type === 'PROVER_STATUS_UPDATE') {
        setStatusMessage(message.message);
      } else if (message.type === 'PROOF_READY') {
        restoreConfirmState(message);
      } else if (message.type === 'PROOF_ERROR') {
        setError(message.error || 'Prover failed');
        setStep(STEP.FORM);
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [restoreConfirmState]);

  // ── Phase 1: Prove (user clicks "Send Tokens") ──
  // Delegates to background.js → offscreen document so the prover runs even if popup closes.
  const handleSend = useCallback(async () => {
    if (!canSubmit) return;
    setError('');
    setStep(STEP.PROVING);
    setStatusMessage('Preparing transfer…');

    try {
      const charmInputs = selectCharmInputs();
      if (charmInputs.length === 0) throw new Error('Not enough token UTXOs for this amount');

      const fundingUtxo = selectFundingUtxo();
      if (!fundingUtxo) throw new Error('No BTC UTXO available for fees. Please ensure you have spendable BTC.');

      // Build inputSigningMap: "txid:vout" → { address, index, isChange }
      const inputSigningMap = {};
      for (const ci of charmInputs) {
        inputSigningMap[ci.utxoId] = { address: ci.address, index: ci.addressIndex, isChange: ci.isChange };
      }
      inputSigningMap[fundingUtxo.utxoId] = {
        address: fundingUtxo.address, index: fundingUtxo.addressIndex, isChange: fundingUtxo.isChange,
      };

      const changeAddr = (addresses || []).find(a => a.index === 0 && !a.isChange)?.address
        || charmInputs[0].address;

      // Keep in component state for immediate use if popup stays open
      setInputSigningMapRef(inputSigningMap);
      setChangeAddrRef(changeAddr);

      const proverParams = {
        tokenAppId:       selectedToken.appId,
        charmInputs:      charmInputs.map(ci => ({ utxoId: ci.utxoId, amount: ci.amount })),
        fundingUtxo:      { utxoId: fundingUtxo.utxoId, value: fundingUtxo.value },
        transferAmount:   rawAmount,
        recipientAddress: recipient.trim(),
        changeAddress:    changeAddr,
        network:          activeNetwork,
      };

      // Metadata stored in ext:pending_proof so CONFIRM can be restored if popup reopens
      const meta = {
        inputSigningMap,
        displayAmount,
        symbol:    selectedToken.symbol,
        recipient: recipient.trim(),
        network:   activeNetwork,
      };

      // Send to background — prover runs in offscreen document (popup can be closed safely)
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: 'START_CHARM_PROOF', params: { proverParams, meta } },
          (response) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (!response?.ok) return reject(new Error(response?.error || 'Failed to start prover'));
            resolve();
          }
        );
      });

      setStatusMessage('Generating ZK proof (5–10 min)… You can close this window.');

    } catch (err) {
      setError(err.message || 'Transfer failed');
      setStep(STEP.FORM);
    }
  }, [canSubmit, selectCharmInputs, selectFundingUtxo, selectedToken, rawAmount, recipient, activeNetwork, addresses, displayAmount]);

  // ── Phase 2: Sign + broadcast (user clicks "Confirm & Sign") ──
  const handleConfirm = useCallback(async () => {
    if (!proverResult || confirming) return;
    setConfirming(true);
    setError('');

    try {
      // [RJJ-AUTOSIGN] — auto-sign path: reads seed phrase from storage and signs directly.
      // Keep for future use when automatic signing is enabled after prover completes.
      const stored = await chrome.storage.local.get(['wallet:seed_phrase']);
      const seedPhrase = stored['wallet:seed_phrase'];
      if (!seedPhrase) throw new Error('Seed phrase not found in wallet storage');

      const { signAndBroadcastTransfer } = await import(
        '../services/charm-transfer/executor.js'
      );

      const result = await signAndBroadcastTransfer({
        spellTxHex: proverResult.spellTxHex,
        prevTxMap: proverResult.prevTxMap,
        inputSigningMap: inputSigningMapRef,
        seedPhrase,
        network: activeNetwork,
        onStatus: () => {},
      });
      // [RJJ-AUTOSIGN] end

      setTxid(result.txid);
      // Clear the pending proof from storage — transfer is done
      chrome.runtime.sendMessage({ type: 'CLEAR_PENDING_PROOF' }).catch(() => {});
      setStep(STEP.SUCCESS);

      if (syncAfterSend) {
        syncAfterSend().catch(() => {});
      }
    } catch (err) {
      setError(err.message || 'Signing or broadcast failed');
      setConfirming(false);
    }
  }, [proverResult, confirming, inputSigningMapRef, activeNetwork, syncAfterSend]);

  // ── Cancel from confirmation screen ──
  const handleCancelConfirm = useCallback(() => {
    setProverResult(null);
    setInputSigningMapRef(null);
    setChangeAddrRef(null);
    setConfirmedSymbol('');
    setStep(STEP.FORM);
    setStatusMessage('');
    setError('');
    // Discard the pending proof from storage
    chrome.runtime.sendMessage({ type: 'CLEAR_PENDING_PROOF' }).catch(() => {});
  }, []);

  const mempoolBase = activeNetwork === 'mainnet'
    ? 'https://mempool.space'
    : 'https://mempool.space/testnet4';

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-dark-950 overflow-hidden">
      {/* Header */}
      <header className="glass-effect flex items-center justify-center px-4 py-3 border-b border-dark-700 relative">
        <span className="font-semibold gradient-text">Send Tokens</span>
        <button
          onClick={onClose}
          className="absolute right-4 text-dark-400 hover:text-white transition-colors"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-auto p-4">

        {/* ═══════ STEP: FORM ═══════ */}
        {step === STEP.FORM && (
          <div className="space-y-4">

            {/* No tokens notice */}
            {tokenBalances.length === 0 && (
              <div className="card p-4 text-center border-yellow-500/20 bg-yellow-900/5 space-y-3">
                {isSyncing ? (
                  <>
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-yellow-400">Syncing wallet…</p>
                    </div>
                    <p className="text-xs text-dark-400">Token balances will appear once sync completes.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-yellow-400">No token balances found.</p>
                    <p className="text-xs text-dark-400">Sync your wallet to load token balances.</p>
                    <button
                      onClick={syncFullWallet}
                      className="mt-1 px-4 py-2 rounded-xl text-xs font-medium bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 transition-colors"
                    >
                      ↻ Sync Now
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Token selector */}
            {tokenBalances.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">Token</label>
                <div className="space-y-2">
                  {tokenBalances.map(tok => (
                    <button
                      key={tok.appId}
                      onClick={() => { setSelectedToken(tok); setDisplayAmount(''); setError(''); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                        selectedToken?.appId === tok.appId
                          ? 'border-primary-500/60 bg-primary-500/10'
                          : 'border-dark-600 bg-dark-800 hover:border-dark-500'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-dark-700">
                        {tok.symbol === '$BRO' || tok.symbol === 'BRO' ? (
                          <img src={BRO_IMAGE} alt="BRO" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white">
                            {tok.symbol[0]}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-sm font-semibold text-white">{tok.symbol}</div>
                        <div className="text-xs text-dark-400">{toDisplay(tok.totalRaw)} available</div>
                      </div>
                      {selectedToken?.appId === tok.appId && (
                        <span className="text-primary-400 text-xs">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Recipient */}
            <div>
              <label className="block text-xs font-medium text-dark-400 mb-1.5">Recipient Address</label>
              <input
                type="text"
                value={recipient}
                onChange={e => { setRecipient(e.target.value); setError(''); }}
                className="w-full px-3 py-3 bg-dark-800 border border-dark-600 rounded-xl text-sm text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all font-mono"
                placeholder={activeNetwork === 'mainnet' ? 'bc1p…' : 'tb1p…'}
              />
              {recipient.length > 5 && !isAddressValid && (
                <p className="text-xs text-red-400 mt-1">Invalid address for {activeNetwork}</p>
              )}
            </div>

            {/* Amount */}
            {selectedToken && (
              <div>
                <label className="block text-xs font-medium text-dark-400 mb-1.5">
                  Amount ({selectedToken.symbol})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={displayAmount}
                    onChange={e => { setDisplayAmount(e.target.value); setError(''); }}
                    className="w-full px-3 py-3 bg-dark-800 border border-dark-600 rounded-xl text-sm text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all pr-16"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                  <button
                    onClick={() => setDisplayAmount(toDisplay(maxRaw))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
                  >
                    MAX
                  </button>
                </div>
                {displayAmount && !isAmountValid && (
                  <p className="text-xs text-red-400 mt-1">
                    Max: {toDisplay(maxRaw)} {selectedToken.symbol}
                  </p>
                )}
              </div>
            )}

            {/* Protocol notice */}
            <div className="card p-3 border-blue-500/20 bg-blue-900/5">
              <p className="text-xs text-blue-400 font-medium mb-1">⏳ ZK Proof Required</p>
              <p className="text-xs text-dark-400">
                Token transfers use the Charms ZK protocol. The prover may take 5–10 minutes to generate the proof.
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-xl">
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* ═══════ STEP: PROVING ═══════ */}
        {step === STEP.PROVING && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-14 h-14 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-white text-center">Processing Transfer</p>
            <p className="text-xs text-dark-300 text-center max-w-[220px] leading-relaxed">
              {statusMessage || 'Generating ZK proof…'}
            </p>
            <p className="text-xs text-dark-500 text-center">
              The proof runs in background — you can close this window and come back later.
            </p>
          </div>
        )}

        {/* ═══════ STEP: CONFIRM (after prover, before signing) ═══════ */}
        {step === STEP.CONFIRM && proverResult && (
          <div className="space-y-4 pt-2">
            <div className="text-center mb-2">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-base font-bold text-white">Confirm Transaction</h2>
              <p className="text-xs text-dark-400 mt-1">Review the details before signing</p>
            </div>

            <div className="space-y-2">
              <div className="card p-3 flex items-center justify-between">
                <span className="text-xs text-dark-400">Send</span>
                <span className="text-sm font-bold text-primary-400">
                  {displayAmount} {selectedToken?.symbol || confirmedSymbol}
                </span>
              </div>
              <div className="card p-3 flex items-center justify-between">
                <span className="text-xs text-dark-400">To</span>
                <span className="text-xs font-mono text-white">{shortenAddr(recipient)}</span>
              </div>
              <div className="card p-3 flex items-center justify-between">
                <span className="text-xs text-dark-400">Network Fee</span>
                <span className="text-xs font-mono text-white">
                  {proverResult.fee != null ? `${proverResult.fee} sats` : '—'}
                </span>
              </div>
              <div className="card p-3 flex items-center justify-between">
                <span className="text-xs text-dark-400">TX Size</span>
                <span className="text-xs font-mono text-dark-300">
                  {Math.round(proverResult.spellTxHex.length / 2)} bytes
                </span>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-xl">
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCancelConfirm}
                disabled={confirming}
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-dark-800 border border-dark-600 text-dark-300 hover:bg-dark-700 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg hover:shadow-green-500/25 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {confirming ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Signing & Broadcasting…
                  </>
                ) : (
                  'Confirm & Sign'
                )}
              </button>
            </div>
          </div>
        )}

        {/* ═══════ STEP: SUCCESS ═══════ */}
        {step === STEP.SUCCESS && (
          <div className="flex flex-col items-center pt-6">
            <div className="relative w-16 h-16 mb-4">
              <div className="absolute inset-0 bg-green-500/20 rounded-full animate-pulse" />
              <div className="relative flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            <h2 className="text-lg font-bold text-white mb-1">Tokens Sent!</h2>
            <p className="text-xs text-dark-400 mb-5">Broadcast to the Bitcoin network</p>

            <div className="w-full space-y-3 mb-5">
              <div className="card p-3 flex items-center justify-between">
                <span className="text-xs text-dark-400">Amount</span>
                <span className="text-sm font-bold text-primary-400">
                  {displayAmount} {selectedToken?.symbol}
                </span>
              </div>
              <div className="card p-3 flex items-center justify-between">
                <span className="text-xs text-dark-400">To</span>
                <span className="text-xs font-mono text-white">{shortenAddr(recipient)}</span>
              </div>
              {txid && (
                <div className="card p-3">
                  <div className="text-xs text-dark-400 mb-1">Transaction ID</div>
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-mono text-white break-all flex-1">{txid}</p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(txid);
                        setCopiedTxid(true);
                        setTimeout(() => setCopiedTxid(false), 2500);
                      }}
                      className="text-[10px] text-dark-400 hover:text-white flex-shrink-0"
                    >
                      {copiedTxid ? '✓' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {txid && (
              <a
                href={`${mempoolBase}/tx/${txid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 rounded-xl text-sm font-medium bg-dark-800 border border-dark-600 text-primary-400 hover:bg-dark-700 transition-all flex items-center justify-center gap-2 mb-3"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View on Mempool
              </a>
            )}

            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-bitcoin-500 to-orange-600 text-white hover:shadow-lg hover:shadow-bitcoin-500/25 transition-all"
            >
              Done
            </button>
          </div>
        )}
      </div>

      {/* ═══════ Bottom bar ═══════ */}
      {step === STEP.FORM && (
        <div className="shrink-0 px-4 py-3 border-t border-dark-700 bg-dark-950">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-medium bg-dark-800 border border-dark-600 text-dark-300 hover:bg-dark-700 hover:text-white transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!canSubmit}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
                canSubmit
                  ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:shadow-lg hover:shadow-primary-500/25'
                  : 'bg-dark-700 text-dark-500 cursor-not-allowed'
              }`}
            >
              Send Tokens
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
