'use client';

/**
 * Beam Back Dialog — 2-step wizard for ADA→BTC reverse beam.
 *
 * Step 1: Amount — how many tokens to send back to Bitcoin
 * Step 2: Confirm — review details, then queue as background operation
 *
 * Differences from regular BeamDialog:
 * - No placeholder creation (uses existing BTC UTXO as placeholder)
 * - No BTC finality wait (Cardano finality via Scrolls certify_final)
 * - Uses `startBeamBack` instead of `startBeam`
 */

import { useState, useMemo, useEffect } from 'react';
import { useBeamOperations } from '@/contexts/BeamOperationsContext';
import { useWallet } from '@/stores/walletStore';
import { useCardano } from '@/stores/cardanoStore';

// ── Step 1: Amount Form ─────────────────────────────────────────────────────

function BeamBackFormStep({ asset, ownBtcAddress, onNext, onClose }) {
  const decimals = asset.decimals || 8;
  const totalRaw = BigInt(asset.quantity);
  const totalDisplay = Number(totalRaw) / Math.pow(10, decimals);

  const [amountStr, setAmountStr] = useState('');
  const [useAll, setUseAll] = useState(false);
  const [useOwnAddress, setUseOwnAddress] = useState(true);
  const [customAddress, setCustomAddress] = useState('');

  const amountRaw = useMemo(() => {
    if (useAll) return totalRaw.toString();
    if (!amountStr) return '0';
    try {
      const num = parseFloat(amountStr);
      if (isNaN(num) || num <= 0) return '0';
      return Math.floor(num * Math.pow(10, decimals)).toString();
    } catch { return '0'; }
  }, [amountStr, useAll, totalRaw, decimals]);

  const destAddress = useOwnAddress ? ownBtcAddress : customAddress.trim();
  const isAddressValid = !!destAddress && (destAddress.startsWith('bc1') || destAddress.startsWith('tb1'));
  const amountValid = BigInt(amountRaw) > 0n && BigInt(amountRaw) <= totalRaw;
  const canProceed = amountValid && isAddressValid;
  const changeRaw = (totalRaw - BigInt(amountRaw)).toString();

  return (
    <div className="space-y-4">
      <div className="bg-gray-800/50 rounded-lg p-4">
        <div className="text-xs text-gray-400 mb-1">Available</div>
        <div className="text-xl font-bold text-purple-400">
          {totalDisplay.toFixed(decimals > 4 ? 4 : decimals)} {asset.ticker || asset.name}
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1 block">Amount to send back to Bitcoin</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={useAll ? totalDisplay.toString() : amountStr}
            onChange={e => { setAmountStr(e.target.value); setUseAll(false); }}
            placeholder="0.0"
            disabled={useAll}
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
          />
          <button
            onClick={() => setUseAll(true)}
            className="px-3 py-2 text-xs rounded bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/30"
          >
            MAX
          </button>
        </div>
      </div>

      {amountValid && BigInt(changeRaw) > 0n && (
        <div className="text-xs text-gray-500">
          Change on Cardano: {(Number(changeRaw) / Math.pow(10, decimals)).toFixed(decimals > 4 ? 4 : decimals)} {asset.ticker}
        </div>
      )}

      <div>
        <label className="text-xs text-gray-400 mb-2 block">Destination Bitcoin address</label>
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => { setUseOwnAddress(true); setCustomAddress(''); }}
            className={`px-3 py-1 rounded text-xs ${useOwnAddress ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400'}`}
          >My Wallet</button>
          <button
            onClick={() => setUseOwnAddress(false)}
            className={`px-3 py-1 rounded text-xs ${!useOwnAddress ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400'}`}
          >Other</button>
        </div>
        {!useOwnAddress && (
          <input
            value={customAddress}
            onChange={e => setCustomAddress(e.target.value)}
            placeholder="bc1..."
            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm font-mono focus:border-purple-500 focus:outline-none"
          />
        )}
        {useOwnAddress && ownBtcAddress && (
          <div className="text-xs text-gray-500 font-mono truncate">{ownBtcAddress}</div>
        )}
      </div>

      <div className="flex gap-2 justify-end mt-6">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
          Cancel
        </button>
        <button
          onClick={() => onNext({ amountRaw, changeRaw, destAddress })}
          disabled={!canProceed}
          className="px-4 py-2 text-sm rounded bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Confirm ─────────────────────────────────────────────────────────

function BeamBackConfirmStep({ asset, amountRaw, changeRaw, destAddress, ownBtcAddress, btcUtxosLoaded, hasEnoughBtc, hasEnoughAda, adaDisplay, onBack, onClose, onConfirm }) {
  const { seedPhrase } = useWallet();
  const { addresses: cardanoAddresses } = useCardano();

  const decimals = asset.decimals || 8;
  const amountDisplay = (Number(amountRaw) / Math.pow(10, decimals)).toFixed(decimals > 4 ? 4 : decimals);

  // Executor creates the BTC placeholder + picks funding at runtime. Dialog
  // only validates that the wallet has enough sats and ADA.
  const error = useMemo(() => {
    if (!btcUtxosLoaded) return 'Loading Bitcoin UTXOs...';
    if (!ownBtcAddress) return 'No Bitcoin address found';
    if (!hasEnoughBtc) return 'Insufficient Bitcoin sats (need ≥ 7000 sats: placeholder + fees + claim funding)';
    if (!hasEnoughAda) return `Insufficient ADA. Need ≥15 ADA on Cardano, have ${adaDisplay} ADA.`;
    if (!destAddress) return 'No destination Bitcoin address';
    return null;
  }, [btcUtxosLoaded, ownBtcAddress, hasEnoughBtc, hasEnoughAda, adaDisplay, destAddress]);

  const cardanoAddress = cardanoAddresses?.[0]?.address;

  const handleConfirm = () => {
    // Resolve token app ID from known policies
    const KNOWN_APPS = {
      'b8f72e95dee612df98ac5a90b7604f7815c2af07a6db209a5c70abe4': 't/3d7fe7e4cea6121947af73d70e5119bebd8aa5b7edfe74bfaf6e779a1847bd9b/c975d4e0c292fb95efbda5c13312d6ac1d8b5aeff7f0f1e5578645a2da70ff5f', // BRO
      '552b22f4989ea698fabbf6314b70d2e5edb49c1fdbdeb6096e8c84b6': 't/0796f63ed48144b4ec69fb794fbc2290ae63acf945fb035d5474648b50ee43b6/fd0cac892e457454be0212fa7d9a0e1517d5bd6a33aa7c66a1f10f55e375c290', // eBTC
    };
    const tokenAppId = KNOWN_APPS[asset.policyId];
    if (!tokenAppId) {
      alert(`Unknown charm policy: ${asset.policyId}. Cannot beam.`);
      return;
    }

    // Executor creates the BTC placeholder, waits for mempool, and derives
    // beam_to hash internally. Dialog just provides addresses + amounts.
    const label = `${amountDisplay} ${asset.ticker || asset.name} → Bitcoin`;
    onConfirm(label, {
      direction: 'ada-to-btc',
      tokenAppId,
      cntUtxoId: `${asset.utxoTxHash}:${asset.utxoOutputIndex || 0}`,
      beamAmount: parseInt(amountRaw),
      changeAmount: parseInt(changeRaw),
      cardanoAddress,
      btcOwnAddress: ownBtcAddress,
      btcDestAddress: destAddress,
      seedPhrase,
      network: 'mainnet',
    });
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Token</span>
          <span className="text-white font-medium">{asset.ticker || asset.name}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Amount</span>
          <span className="text-purple-400 font-bold">{amountDisplay}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Direction</span>
          <span className="text-white">Cardano → Bitcoin</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">To BTC address</span>
          <span className="text-white font-mono text-xs">{destAddress?.slice(0, 20)}...</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="bg-yellow-900/10 border border-yellow-700/20 rounded-lg p-3 text-xs text-yellow-300">
        ⚠️ This process takes ~30-60 min (waits for Cardano Mithril finality certification).
        You can close the browser — the beam will resume when you return.
      </div>

      <div className="flex gap-2 justify-end mt-6">
        <button onClick={onBack} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
          Back
        </button>
        <button
          onClick={handleConfirm}
          disabled={!!error}
          className="px-4 py-2 text-sm rounded bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start Beam Back
        </button>
      </div>
    </div>
  );
}

// ── Main Dialog ─────────────────────────────────────────────────────────────

export default function BeamBackDialog({ asset, isOpen, onClose }) {
  const [step, setStep] = useState('form');
  const [amounts, setAmounts] = useState({ amountRaw: '0', changeRaw: '0', destAddress: '' });
  const [ownBtcAddress, setOwnBtcAddress] = useState('');
  const [btcUtxos, setBtcUtxos] = useState([]);
  const [btcUtxosLoaded, setBtcUtxosLoaded] = useState(false);
  const { startBeamBack } = useBeamOperations();

  useEffect(() => {
    if (isOpen) {
      setStep('form');
      setAmounts({ amountRaw: '0', changeRaw: '0', destAddress: '' });
      setBtcUtxosLoaded(false);
      setBtcUtxos([]);
    }
  }, [isOpen]);

  // Load BTC address + UTXOs. Needed to validate the wallet can fund
  // placeholder + claim. Actual placeholder creation runs in the executor.
  // Routes through mempoolService so Explorer API is preferred and we don't
  // hit direct-from-browser CORS on mempool.space.
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const { getAddresses } = await import('@/services/storage');
        const { mempoolService } = await import('@/services/shared/mempool-service');
        const stored = await getAddresses('bitcoin', 'mainnet');
        const addr = stored?.find(a => a.index === 0 && !a.isChange)?.address || stored?.[0]?.address;
        if (!addr) { setBtcUtxosLoaded(true); return; }
        setOwnBtcAddress(addr);
        const { utxos } = await mempoolService.getAddressUTXOs(addr, 'mainnet');
        setBtcUtxos((utxos || []).filter(u => u.status?.confirmed));
      } catch {}
      setBtcUtxosLoaded(true);
    })();
  }, [isOpen]);

  // Need ≥ 7000 sats total: 546 placeholder dust + ~500 sats placeholder fee +
  // ~5000 sats funding UTXO for the BTC claim tx fee.
  const hasEnoughBtc = btcUtxos.reduce((s, u) => s + (u.value || 0), 0) >= 7000;

  // Cardano side: ~15 ADA covers placeholder, collateral, funding + fees with
  // headroom for the prover. Same floor as the other beam dialogs.
  const adaLovelace = BigInt(useCardano.getState().adaBalance || '0');
  const MIN_ADA_LOVELACE = BigInt(15_000_000);
  const hasEnoughAda = adaLovelace >= MIN_ADA_LOVELACE;
  const adaDisplay = (Number(adaLovelace) / 1_000_000).toFixed(2);

  if (!isOpen) return null;

  const handleConfirm = (label, payload) => {
    startBeamBack(label, payload);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Beam to Bitcoin</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        {step === 'form' && (
          <BeamBackFormStep
            asset={asset}
            ownBtcAddress={ownBtcAddress}
            onNext={(data) => { setAmounts(data); setStep('confirm'); }}
            onClose={onClose}
          />
        )}
        {step === 'confirm' && (
          <BeamBackConfirmStep
            asset={asset}
            amountRaw={amounts.amountRaw}
            changeRaw={amounts.changeRaw}
            destAddress={amounts.destAddress}
            ownBtcAddress={ownBtcAddress}
            btcUtxosLoaded={btcUtxosLoaded}
            hasEnoughBtc={hasEnoughBtc}
            hasEnoughAda={hasEnoughAda}
            adaDisplay={adaDisplay}
            onBack={() => setStep('form')}
            onClose={onClose}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </div>
  );
}
