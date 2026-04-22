'use client';

/**
 * Beam Dialog — 2-step wizard for initiating a BTC→ADA beam.
 *
 * Step 1: Form — amount + Cardano destination address
 * Step 2: Confirm — review details, then queue as background operation
 *
 * Once confirmed, the dialog closes and the BeamPanel takes over.
 * Accesses wallet stores directly (seedPhrase, UTXOs, addresses, network).
 */

import { useState, useMemo, useEffect } from 'react';
import { useBeamOperations } from '@/contexts/BeamOperationsContext';
import { useWallet } from '@/stores/walletStore';
import { useUTXOs } from '@/stores/utxoStore';
import { useAddresses } from '@/stores/addressesStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useCharms } from '@/stores/charmsStore';
import { useCardano } from '@/stores/cardanoStore';
import { charmUtxoSelector } from '@/services/charms/utils/charm-utxo-selector';
import { selectBtcFunding } from '@/services/beam/chains/bitcoin/funding';

// ── Step 1: Form ────────────────────────────────────────────────────────────

function BeamFormStep({ charm, seedPhrase, network, onNext, onClose }) {
  const [beamAmount, setBeamAmount] = useState('');
  const [cardanoAddress, setCardanoAddress] = useState('');
  const [useOwnAddress, setUseOwnAddress] = useState(true);
  const [ownAddress, setOwnAddress] = useState('');

  // Load Cardano address: try store first, then storage, then derive as last resort
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Try cardanoStore (instant if CardanoDashboard was visited)
      const storeAddr = useCardano.getState().addresses[0]?.address;
      if (storeAddr) {
        if (!cancelled) { setOwnAddress(storeAddr); setCardanoAddress(storeAddr); }
        return;
      }

      // 2. Try storage (instant if wallet was initialized with Cardano)
      try {
        const { getAddresses } = await import('@/services/storage');
        const cardanoNet = network === 'mainnet' ? 'mainnet' : 'preprod';
        const stored = await getAddresses('cardano', cardanoNet);
        if (stored?.length && stored[0]?.address) {
          if (!cancelled) { setOwnAddress(stored[0].address); setCardanoAddress(stored[0].address); }
          return;
        }
      } catch { /* continue to derive */ }

      // 3. Derive fresh (slow path, only if nothing cached)
      if (seedPhrase) {
        try {
          const { waitForCardanoWasm } = await import('@/lib/cardano/cardanoWasm');
          await waitForCardanoWasm();
          const { generateCardanoAddress } = await import('@/lib/cardano/wallet');
          const cardanoNet = network === 'mainnet' ? 'mainnet' : 'preprod';
          const addr = await generateCardanoAddress(seedPhrase, 0, cardanoNet);
          if (!cancelled) { setOwnAddress(addr); setCardanoAddress(addr); }
        } catch (err) {
          console.error('Failed to derive Cardano address:', err);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [seedPhrase, network]);

  const decimals = charm.decimals || 8;
  const ticker = charm.ticker || charm.metadata?.ticker || 'BRO';
  const allUtxos = charm.allUtxos || [charm];

  const maxInfo = useMemo(() => {
    const result = charmUtxoSelector.getMaxTransferableAmount(allUtxos, charm.appId);
    const divisor = Math.pow(10, decimals);
    return {
      maxAmount: result.maxAmount / divisor,
      totalBalance: result.totalBalance / divisor,
    };
  }, [allUtxos, charm.appId, decimals]);

  const effectiveAddress = useOwnAddress ? ownAddress : cardanoAddress;
  const isAddressValid = effectiveAddress && (
    effectiveAddress.startsWith('addr1') || effectiveAddress.startsWith('addr_test1')
  );
  const isAmountValid = beamAmount && parseFloat(beamAmount) > 0 && parseFloat(beamAmount) <= maxInfo.maxAmount;
  const isFormValid = isAddressValid && isAmountValid;

  const handleNext = () => {
    if (!isFormValid) return;
    const amountRaw = Math.floor(parseFloat(beamAmount) * Math.pow(10, decimals));
    onNext({
      beamAmount: amountRaw,
      beamAmountDisplay: beamAmount,
      cardanoAddress: effectiveAddress,   // where the beamed tokens land
      cardanoOwnAddress: ownAddress,      // pays placeholder + claim fees
      ticker,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Beam to Cardano</h3>
          <button onClick={onClose} className="text-dark-400 hover:text-white text-xl">&times;</button>
        </div>

        {/* Amount */}
        <div className="mb-4">
          <label className="block text-sm text-dark-300 mb-1">Amount ({ticker})</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={beamAmount}
              onChange={e => setBeamAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              max={maxInfo.maxAmount}
              step="any"
              className="flex-1 bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
            />
            <button
              onClick={() => setBeamAmount(maxInfo.maxAmount.toString())}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-dark-700 text-dark-300 hover:text-white border border-dark-600"
            >
              MAX
            </button>
          </div>
          <div className="text-xs text-dark-400 mt-1">
            Available: {maxInfo.maxAmount.toLocaleString(undefined, { maximumFractionDigits: decimals })} {ticker}
          </div>
        </div>

        {/* Destination */}
        <div className="mb-4">
          <label className="block text-sm text-dark-300 mb-2">Cardano Destination</label>

          {/* Tab selector */}
          <div className="flex mb-2 rounded-lg overflow-hidden border border-dark-600">
            <button
              onClick={() => { setUseOwnAddress(true); if (ownAddress) setCardanoAddress(ownAddress); }}
              className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${
                useOwnAddress
                  ? 'bg-purple-600/30 text-purple-300 border-b-2 border-purple-500'
                  : 'bg-dark-800 text-dark-400 hover:text-dark-200'
              }`}
            >
              My Wallet
            </button>
            <button
              onClick={() => { setUseOwnAddress(false); setCardanoAddress(''); }}
              className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${
                !useOwnAddress
                  ? 'bg-purple-600/30 text-purple-300 border-b-2 border-purple-500'
                  : 'bg-dark-800 text-dark-400 hover:text-dark-200'
              }`}
            >
              Other
            </button>
          </div>

          {/* Content */}
          {useOwnAddress ? (
            <div className="bg-dark-900 border border-dark-600 rounded-lg px-3 py-2.5 text-xs text-dark-300 font-mono break-all">
              {ownAddress ? (
                ownAddress
              ) : (
                <span className="text-dark-500">No seed phrase available</span>
              )}
            </div>
          ) : (
            <input
              type="text"
              value={cardanoAddress}
              onChange={e => setCardanoAddress(e.target.value)}
              placeholder="addr1... or addr_test1..."
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2.5 text-white text-sm focus:border-purple-500 focus:outline-none font-mono"
            />
          )}
        </div>

        {/* Estimated time */}
        <div className="bg-dark-900 border border-dark-700 rounded-lg p-3 mb-4 text-xs text-dark-400">
          <div className="flex justify-between mb-1">
            <span>Cardano placeholder</span><span>~30s</span>
          </div>
          <div className="flex justify-between mb-1">
            <span>ZK proof generation</span><span>~5-10 min</span>
          </div>
          <div className="flex justify-between mb-1">
            <span>Bitcoin finality (6 blocks)</span><span>~60 min</span>
          </div>
          <div className="flex justify-between font-medium text-dark-300">
            <span>Total estimated</span><span>~70 min</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleNext}
            disabled={!isFormValid}
            className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all ${
              isFormValid
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : 'bg-dark-700 text-dark-500 cursor-not-allowed'
            }`}
          >
            Review Beam
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-sm text-dark-300 hover:text-white border border-dark-600 hover:border-dark-500"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Confirm ─────────────────────────────────────────────────────────

function BeamConfirmStep({ charm, beamData, onConfirm, onBack, onClose }) {
  const { utxos } = useUTXOs();
  const { addresses } = useAddresses();
  const { charms } = useCharms();
  const { seedPhrase } = useWallet();
  const { activeNetwork } = useBlockchain();
  const [copied, setCopied] = useState(false);

  const ticker = beamData.ticker;
  const allUtxos = charm.allUtxos || charms.filter(c => c.appId === charm.appId);

  // Ensure Cardano data is loaded (may not be if user never visited Cardano view)
  const cardanoInitialized = useCardano(s => s.initialized);
  const cardanoLoad = useCardano(s => s.loadFromStorage);
  const cardanoDeriveAddresses = useCardano(s => s.deriveAddresses);
  const cardanoRefresh = useCardano(s => s.refresh);

  // Always refresh on mount — no caching guard. Ensures fresh balance
  // before the user clicks Start Beam.
  useEffect(() => {
    const adaNet = activeNetwork === 'mainnet' ? 'mainnet' : 'preprod';
    cardanoLoad(adaNet).then(() => {
      const storeAddrs = useCardano.getState().addresses;
      if (!storeAddrs.length && seedPhrase) {
        cardanoDeriveAddresses(seedPhrase, adaNet, 1).then(() => cardanoRefresh());
      } else {
        cardanoRefresh();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Bitcoin: Select charm UTXOs ───────────────────────────────────────
  const charmInputs = useMemo(() => {
    const result = charmUtxoSelector.selectCharmUtxosForAmount(
      allUtxos, charm.appId, beamData.beamAmount
    );
    const selected = result?.selectedUtxos || result || [];
    return (Array.isArray(selected) ? selected : []).map(u => ({
      utxoId: `${u.txid}:${u.outputIndex}`,
      amount: charmUtxoSelector.getUtxoAmount?.(u) ?? u.amount ?? 0,
      address: u.address,
    }));
  }, [allUtxos, charm.appId, beamData.beamAmount]);

  // ── Bitcoin: Select funding UTXO (uses shared helper) ────────────────
  const fundingUtxo = useMemo(() => {
    const allUtxoList = Object.entries(utxos || {}).flatMap(([addr, list]) =>
      (Array.isArray(list) ? list : []).map(u => ({ ...u, address: u.address || addr }))
    );
    const f = selectBtcFunding(allUtxoList, charms, { minSats: 1000 });
    if (!f) return null;
    // Find the original utxo to get the address
    const original = allUtxoList.find(u =>
      u.txid === f.txid && (u.outputIndex ?? u.vout) === f.vout
    );
    return { utxoId: f.utxoId, value: f.value, address: original?.address };
  }, [utxos, charms]);

  // ── Bitcoin: Build signing map ────────────────────────────────────────
  const inputSigningMap = useMemo(() => {
    const map = {};
    for (const ci of charmInputs) {
      const addr = addresses.find(a => a.address === ci.address);
      map[ci.utxoId] = { address: ci.address, index: addr?.index ?? 0, isChange: addr?.isChange ?? false };
    }
    if (fundingUtxo) {
      const addr = addresses.find(a => a.address === fundingUtxo.address);
      map[fundingUtxo.utxoId] = { address: fundingUtxo.address, index: addr?.index ?? 0, isChange: addr?.isChange ?? false };
    }
    return map;
  }, [charmInputs, fundingUtxo, addresses]);

  const changeAddress = addresses.find(a => a.index === 0 && !a.isChange)?.address;

  // ── Cardano: Check ADA balance ────────────────────────────────────────
  const cardanoAddr = useCardano(s => s.addresses[0]?.address);
  const adaBalance = useCardano(s => s.adaBalance);
  const cardanoUtxos = useCardano(s => s.utxos || []);
  const adaLovelace = BigInt(adaBalance || '0');
  // Minimum ADA needed:
  //   Placeholder output: 1.3 ADA (min UTXO, returned in claim)
  //   Placeholder fee:    ~0.17 ADA
  //   Collateral:         2.0 ADA (refunded on success)
  //   Funding for claim:  ~7 ADA (covers protocol fee + outputs + change)
  //   Total minimum:      ~10 ADA
  //   The executor will auto-consolidate fragmented UTXOs if needed.
  const MIN_ADA_LOVELACE = BigInt(10_000_000);
  const hasEnoughAda = adaLovelace >= MIN_ADA_LOVELACE;
  const adaDisplay = (Number(adaLovelace) / 1_000_000).toFixed(2);

  // Detect fragmented UTXOs (need consolidation)
  const pureAdaUtxos = cardanoUtxos.filter(u => !u.assets?.length);
  const largestPureAda = pureAdaUtxos.reduce((max, u) => {
    const v = BigInt(u.lovelace || '0');
    return v > max ? v : max;
  }, 0n);
  const isFragmented = hasEnoughAda && largestPureAda < BigInt(7_000_000);

  // ── Validation errors ─────────────────────────────────────────────────
  const errors = [];
  if (!fundingUtxo) errors.push({ type: 'btc', msg: 'No spendable Bitcoin UTXO found (need at least 1,000 sats for fees).' });
  if (!charmInputs.length) errors.push({ type: 'btc', msg: `No ${ticker} UTXOs available for the requested amount.` });
  if (!hasEnoughAda) errors.push({ type: 'ada', msg: `Insufficient ADA. Need ≥10 ADA to start a beam, have ${adaDisplay} ADA.` });
  const warnings = [];
  if (isFragmented) warnings.push(`Cardano UTXOs are fragmented (largest pure ADA: ${(Number(largestPureAda)/1e6).toFixed(2)} ADA). Wallet will auto-consolidate before claim (one extra tx).`);
  const canStart = errors.length === 0;

  const handleCopyAddr = async () => {
    if (cardanoAddr) {
      await navigator.clipboard.writeText(cardanoAddr).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ── Rows ──────────────────────────────────────────────────────────────
  const rows = [
    { label: 'Direction', value: 'Bitcoin → Cardano' },
    { label: 'Token', value: ticker },
    { label: 'Amount', value: `${beamData.beamAmountDisplay} ${ticker}` },
    { label: 'Destination', value: truncAddr(beamData.cardanoAddress) },
  ];
  if (charmInputs.length) rows.push({ label: 'Charm inputs', value: `${charmInputs.length} UTXO(s)` });
  if (fundingUtxo) rows.push({ label: 'BTC funding', value: `${fundingUtxo.value.toLocaleString()} sats` });
  rows.push({ label: 'ADA balance', value: `${adaDisplay} ADA`, warn: !hasEnoughAda });
  if (changeAddress) rows.push({ label: 'BTC change to', value: truncAddr(changeAddress) });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Confirm Beam</h3>
          <button onClick={onClose} className="text-dark-400 hover:text-white text-xl">&times;</button>
        </div>

        {/* Summary rows */}
        <div className="bg-dark-900 rounded-lg p-4 mb-4 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-dark-400">{r.label}</span>
              <span className={`font-mono text-xs ${r.warn ? 'text-red-400 font-semibold' : 'text-white'}`}>{r.value}</span>
            </div>
          ))}
        </div>

        {/* Info box */}
        <div className="bg-purple-900/20 border border-purple-700/30 rounded-lg p-3 mb-4 text-xs text-purple-300">
          Beaming locks {beamData.beamAmountDisplay} {ticker} on Bitcoin and mints proxy CNTs on Cardano.
          Your Cardano wallet pays the placeholder, protocol fee, and claim tx fee. Need ≥10 ADA to start.
        </div>

        {/* Warnings (non-blocking) */}
        {warnings.map((w, i) => (
          <div key={i} className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 mb-3 text-xs text-amber-300">
            {w}
          </div>
        ))}

        {/* Errors */}
        {errors.map((e, i) => (
          <div key={i} className={`rounded-lg p-3 mb-3 text-xs ${e.type === 'ada' ? 'bg-amber-900/20 border border-amber-700/30 text-amber-300' : 'bg-red-900/20 border border-red-700/30 text-red-400'}`}>
            {e.msg}
            {e.type === 'ada' && cardanoAddr && (
              <div className="mt-2">
                <div className="text-xs text-dark-400 mb-1">Fund your Cardano address with at least 10 ADA:</div>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-dark-300 break-all flex-1">{cardanoAddr}</code>
                  <button
                    onClick={handleCopyAddr}
                    className="text-xs px-2 py-1 rounded bg-dark-700 text-dark-300 hover:text-white border border-dark-600 flex-shrink-0"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => onConfirm({
              tokenAppId: charm.appId,
              charmInputs,
              fundingUtxo: { utxoId: fundingUtxo.utxoId, value: fundingUtxo.value },
              beamAmount: beamData.beamAmount,
              cardanoAddress: beamData.cardanoAddress,
              cardanoOwnAddress: beamData.cardanoOwnAddress,
              inputSigningMap,
              btcChangeAddress: changeAddress,
            })}
            disabled={!canStart}
            className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all ${
              canStart ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-dark-700 text-dark-500 cursor-not-allowed'
            }`}
          >
            Start Beam
          </button>
          <button
            onClick={onBack}
            className="px-4 py-2.5 rounded-lg text-sm text-dark-300 hover:text-white border border-dark-600 hover:border-dark-500"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Wizard ───────────────────────────────────────────────────────────────────

export default function BeamDialog({ charm, onClose }) {
  const [step, setStep] = useState(1);
  const [beamData, setBeamData] = useState(null);

  const { seedPhrase } = useWallet();
  const { activeNetwork, activeBlockchain } = useBlockchain();
  const { startBeam } = useBeamOperations();

  // Beam is cross-chain: resolve BOTH networks regardless of current view
  // Bitcoin network: mainnet or testnet4
  // Cardano network: mainnet or preprod
  const btcNetwork = activeBlockchain === 'bitcoin' ? activeNetwork : 'mainnet';
  const adaNetwork = activeBlockchain === 'cardano' ? activeNetwork : 'mainnet';

  const handleFormNext = (data) => {
    setBeamData(data);
    setStep(2);
  };

  const handleConfirm = (payload) => {
    const label = `${beamData.beamAmountDisplay} ${beamData.ticker} → Cardano`;
    startBeam(label, {
      ...payload,
      seedPhrase,
      network: btcNetwork,      // Bitcoin network for the prover
      adaNetwork,               // Cardano network for placeholder + claim
    });
    onClose();
  };

  if (step === 1) {
    return (
      <BeamFormStep
        charm={charm}
        seedPhrase={seedPhrase}
        network={adaNetwork}    // Cardano network for address derivation
        onNext={handleFormNext}
        onClose={onClose}
      />
    );
  }

  return (
    <BeamConfirmStep
      charm={charm}
      beamData={beamData}
      onConfirm={handleConfirm}
      onBack={() => setStep(1)}
      onClose={onClose}
    />
  );
}

function truncAddr(addr) {
  if (!addr) return '—';
  if (addr.length <= 24) return addr;
  return addr.slice(0, 14) + '...' + addr.slice(-8);
}
