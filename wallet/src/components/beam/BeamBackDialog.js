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
import { useUTXOs } from '@/stores/utxoStore';
import { useAddresses } from '@/stores/addressesStore';
import { useCharms } from '@/stores/charmsStore';
import { useCardano } from '@/stores/cardanoStore';
import { selectBtcFunding } from '@/services/beam/chains/bitcoin/funding';

// ── Step 1: Amount Form ─────────────────────────────────────────────────────

function BeamBackFormStep({ asset, onNext, onClose }) {
  const decimals = asset.decimals || 8;
  const totalRaw = BigInt(asset.quantity);
  const totalDisplay = Number(totalRaw) / Math.pow(10, decimals);

  const [amountStr, setAmountStr] = useState('');
  const [useAll, setUseAll] = useState(false);

  const amountRaw = useMemo(() => {
    if (useAll) return totalRaw.toString();
    if (!amountStr) return '0';
    try {
      const num = parseFloat(amountStr);
      if (isNaN(num) || num <= 0) return '0';
      return Math.floor(num * Math.pow(10, decimals)).toString();
    } catch { return '0'; }
  }, [amountStr, useAll, totalRaw, decimals]);

  const amountValid = BigInt(amountRaw) > 0n && BigInt(amountRaw) <= totalRaw;
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

      <div className="flex gap-2 justify-end mt-6">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
          Cancel
        </button>
        <button
          onClick={() => onNext({ amountRaw, changeRaw })}
          disabled={!amountValid}
          className="px-4 py-2 text-sm rounded bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Confirm ─────────────────────────────────────────────────────────

function BeamBackConfirmStep({ asset, amountRaw, changeRaw, onBack, onClose, onConfirm }) {
  const { seedPhrase } = useWallet();
  const { utxos } = useUTXOs();
  const { addresses } = useAddresses();
  const { charms } = useCharms();
  const { addresses: cardanoAddresses } = useCardano();

  const decimals = asset.decimals || 8;
  const amountDisplay = (Number(amountRaw) / Math.pow(10, decimals)).toFixed(decimals > 4 ? 4 : decimals);

  // Resolve BTC placeholder (existing UTXO) and BTC destination
  const { btcPlaceholderUtxoId, btcPlaceholderValue, btcFundingUtxoId, btcDestinationAddr, error } = useMemo(() => {
    const allUtxoList = Object.entries(utxos || {}).flatMap(([addr, list]) =>
      (Array.isArray(list) ? list : []).map(u => ({ ...u, address: u.address || addr }))
    );

    // Placeholder: any existing BTC UTXO (non-charm, ≥546 sats)
    const placeholder = selectBtcFunding(allUtxoList, charms, { minSats: 546 });
    if (!placeholder) return { error: 'No Bitcoin UTXO available as placeholder' };

    // Funding: another UTXO (larger) for fees
    const funding = selectBtcFunding(allUtxoList, charms, {
      minSats: 5000,
      excludeUtxoIds: [placeholder.utxoId],
    });
    if (!funding) return { error: 'No Bitcoin UTXO for funding (need ≥5000 sats)' };

    const btcAddr = addresses?.[0]?.address;
    if (!btcAddr) return { error: 'No Bitcoin address found' };

    return {
      btcPlaceholderUtxoId: placeholder.utxoId,
      btcPlaceholderValue: placeholder.value,
      btcFundingUtxoId: funding.utxoId,
      btcDestinationAddr: btcAddr,
    };
  }, [utxos, charms, addresses]);

  const cardanoAddress = cardanoAddresses?.[0]?.address;

  const handleConfirm = () => {
    // Resolve proper eBTC app ID (for now, map known policies)
    // In production, this should come from the asset metadata
    const KNOWN_APPS = {
      'b8f72e95dee612df98ac5a90b7604f7815c2af07a6db209a5c70abe4': 't/3d7fe7e4cea6121947af73d70e5119bebd8aa5b7edfe74bfaf6e779a1847bd9b/c975d4e0c292fb95efbda5c13312d6ac1d8b5aeff7f0f1e5578645a2da70ff5f', // BRO
      '552b22f4989ea698fabbf6314b70d2e5edb49c1fdbdeb6096e8c84b6': 't/0796f63ed48144b4ec69fb794fbc2290ae63acf945fb035d5474648b50ee43b6/fd0cac892e457454be0212fa7d9a0e1517d5bd6a33aa7c66a1f10f55e375c290', // eBTC
    };
    const tokenAppId = KNOWN_APPS[asset.policyId];
    if (!tokenAppId) {
      alert(`Unknown charm policy: ${asset.policyId}. Cannot beam.`);
      return;
    }

    // Compute beam_to hash from BTC placeholder
    const [phTxid, phVout] = btcPlaceholderUtxoId.split(':');
    const { createHash } = require('crypto');
    const txidBytes = Buffer.from(phTxid, 'hex');
    txidBytes.reverse();
    const voutBuf = Buffer.alloc(4);
    voutBuf.writeUInt32LE(parseInt(phVout));
    const beamToHash = createHash('sha256').update(Buffer.concat([txidBytes, voutBuf])).digest('hex');

    const label = `${amountDisplay} ${asset.ticker || asset.name} → Bitcoin`;
    onConfirm(label, {
      tokenAppId,
      cntUtxoId: `${asset.utxoTxHash}:${asset.utxoOutputIndex || 0}`, // will need asset-level UTXO tracking
      beamAmount: parseInt(amountRaw),
      changeAmount: parseInt(changeRaw),
      btcPlaceholderUtxoId,
      btcFundingUtxoId,
      beamToHash,
      cardanoAddress,
      btcChangeAddress: btcDestinationAddr,
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
          <span className="text-white font-mono text-xs">{btcDestinationAddr?.slice(0, 20)}...</span>
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
  const [amounts, setAmounts] = useState({ amountRaw: '0', changeRaw: '0' });
  const { startBeamBack } = useBeamOperations();

  useEffect(() => {
    if (isOpen) { setStep('form'); setAmounts({ amountRaw: '0', changeRaw: '0' }); }
  }, [isOpen]);

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
            onNext={(data) => { setAmounts(data); setStep('confirm'); }}
            onClose={onClose}
          />
        )}
        {step === 'confirm' && (
          <BeamBackConfirmStep
            asset={asset}
            amountRaw={amounts.amountRaw}
            changeRaw={amounts.changeRaw}
            onBack={() => setStep('form')}
            onClose={onClose}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </div>
  );
}
