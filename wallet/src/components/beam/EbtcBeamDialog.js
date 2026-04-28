'use client';

/**
 * eBTC Beam Dialog — 2-step wizard for Lock BTC → Mint eBTC → Beam to Cardano.
 *
 * Step 1: Form — enter sats to lock, choose Cardano destination
 * Step 2: Confirm — review details + pre-flight checks, then queue background op
 */

import { useState, useMemo, useEffect } from 'react';
import { useBeamOperations } from '@/contexts/BeamOperationsContext';
import { useWallet } from '@/stores/walletStore';
import { useUTXOs } from '@/stores/utxoStore';
import { useAddresses } from '@/stores/addressesStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useCharms } from '@/stores/charmsStore';
import { useCardano } from '@/stores/cardanoStore';
import { selectBtcFunding } from '@/services/beam/chains/bitcoin/funding';
import { useWalletSync } from '@/hooks/useWalletSync';

const DUST_PER_VAULT = 300;
const MIN_LOCK_SATS = 1000;

// ── Step 1: Form ────────────────────────────────────────────────────────────

function EbtcFormStep({ seedPhrase, network, onNext, onClose }) {
  const [lockSats, setLockSats] = useState('');
  const [cardanoAddress, setCardanoAddress] = useState('');
  const [useOwnAddress, setUseOwnAddress] = useState(true);
  const [ownAddress, setOwnAddress] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const storeAddr = useCardano.getState().addresses[0]?.address;
      if (storeAddr) {
        if (!cancelled) { setOwnAddress(storeAddr); setCardanoAddress(storeAddr); }
        return;
      }
      try {
        const { getAddresses } = await import('@/services/storage');
        const cardanoNet = network === 'mainnet' ? 'mainnet' : 'preprod';
        const stored = await getAddresses('cardano', cardanoNet);
        if (stored?.length && stored[0]?.address) {
          if (!cancelled) { setOwnAddress(stored[0].address); setCardanoAddress(stored[0].address); }
          return;
        }
      } catch {}
      if (seedPhrase) {
        try {
          const { waitForCardanoWasm } = await import('@/lib/cardano/cardanoWasm');
          await waitForCardanoWasm();
          const { generateCardanoAddress } = await import('@/lib/cardano/wallet');
          const cardanoNet = network === 'mainnet' ? 'mainnet' : 'preprod';
          const addr = await generateCardanoAddress(seedPhrase, 0, cardanoNet);
          if (!cancelled) { setOwnAddress(addr); setCardanoAddress(addr); }
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [seedPhrase, network]);

  const satsNum = parseInt(lockSats) || 0;
  const mintAmount = satsNum > DUST_PER_VAULT ? satsNum - DUST_PER_VAULT : 0;
  const effectiveAddress = useOwnAddress ? ownAddress : cardanoAddress;
  const isAddressValid = effectiveAddress && (
    effectiveAddress.startsWith('addr1') || effectiveAddress.startsWith('addr_test1')
  );
  const isAmountValid = satsNum >= MIN_LOCK_SATS;
  const isFormValid = isAddressValid && isAmountValid;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Beam BTC to Cardano</h3>
          <button onClick={onClose} className="text-dark-400 hover:text-white text-xl">&times;</button>
        </div>

        <div className="text-xs text-dark-400 mb-4">
          Beam your Bitcoin to Cardano as eBTC tokens. The process runs in the background.
        </div>

        {/* Amount */}
        <div className="mb-4">
          <label className="text-sm text-dark-300 mb-1 block">Amount (sats)</label>
          <input
            type="number"
            value={lockSats}
            onChange={e => setLockSats(e.target.value)}
            placeholder={`Min ${MIN_LOCK_SATS} sats`}
            min={MIN_LOCK_SATS}
            className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
          />
          {satsNum >= MIN_LOCK_SATS && (
            <div className="text-xs text-purple-400 mt-1">
              You will receive {mintAmount.toLocaleString()} eBTC on Cardano
            </div>
          )}
        </div>

        {/* Destination */}
        <div className="mb-4">
          <label className="text-sm text-dark-300 mb-2 block">Cardano destination</label>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => { setUseOwnAddress(true); setCardanoAddress(ownAddress); }}
              className={`px-3 py-1 rounded text-xs ${useOwnAddress ? 'bg-purple-600 text-white' : 'bg-dark-700 text-dark-400'}`}
            >My Wallet</button>
            <button
              onClick={() => { setUseOwnAddress(false); setCardanoAddress(''); }}
              className={`px-3 py-1 rounded text-xs ${!useOwnAddress ? 'bg-purple-600 text-white' : 'bg-dark-700 text-dark-400'}`}
            >Other</button>
          </div>
          {!useOwnAddress && (
            <input
              value={cardanoAddress}
              onChange={e => setCardanoAddress(e.target.value)}
              placeholder="addr1..."
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-purple-500 focus:outline-none"
            />
          )}
          {useOwnAddress && ownAddress && (
            <div className="text-xs text-dark-500 font-mono truncate">{ownAddress}</div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => onNext({ lockSats: satsNum, mintAmount, cardanoAddress: effectiveAddress })}
            disabled={!isFormValid}
            className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all ${
              isFormValid ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-dark-700 text-dark-500 cursor-not-allowed'
            }`}
          >Next</button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm text-dark-300 hover:text-white border border-dark-600">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Confirm ─────────────────────────────────────────────────────────

function EbtcConfirmStep({ formData, seedPhrase, network, onConfirm, onBack, onClose }) {
  const [copied, setCopied] = useState(false);
  const { utxos, refreshUTXOs } = useUTXOs();
  const { addresses } = useAddresses();
  const { charms } = useCharms();

  // Auto-refresh BTC UTXOs on mount to get fresh state (avoid spent UTXOs)
  useEffect(() => {
    refreshUTXOs?.('bitcoin', 'mainnet').catch(() => {});
  }, [refreshUTXOs]);
  const cardanoAddr = useCardano(s => s.addresses[0]?.address);
  const adaBalance = useCardano(s => s.adaBalance);
  const cardanoRefresh = useCardano(s => s.refresh);
  const cardanoLoadFromStorage = useCardano(s => s.loadFromStorage);
  const cardanoDeriveAddresses = useCardano(s => s.deriveAddresses);
  const cardanoInitialized = useCardano(s => s.initialized);
  const adaLovelace = BigInt(adaBalance || '0');
  const MIN_ADA_LOVELACE = BigInt(15_000_000);
  const hasEnoughAda = adaLovelace >= MIN_ADA_LOVELACE;
  const adaDisplay = (Number(adaLovelace) / 1_000_000).toFixed(2);

  // Auto-refresh: ensure Cardano store is initialized + fetch fresh balances
  useEffect(() => {
    (async () => {
      const cardanoNet = network === 'mainnet' ? 'mainnet' : 'preprod';
      if (!cardanoInitialized) {
        await cardanoLoadFromStorage(cardanoNet);
        const state = useCardano.getState();
        if (!state.addresses.length && seedPhrase) {
          await cardanoDeriveAddresses(seedPhrase, cardanoNet);
        }
      }
      cardanoRefresh();
    })();
  }, [cardanoInitialized, cardanoLoadFromStorage, cardanoDeriveAddresses, cardanoRefresh, seedPhrase, network]);

  const fundingUtxo = useMemo(() => {
    const allUtxoList = Object.entries(utxos || {}).flatMap(([addr, list]) =>
      (Array.isArray(list) ? list : []).map(u => ({ ...u, address: u.address || addr }))
    );
    return selectBtcFunding(allUtxoList, charms, { minSats: formData.lockSats + 5000 });
  }, [utxos, charms, formData.lockSats]);

  const btcAddress = addresses.find(a => a.index === 0 && !a.isChange)?.address;

  const errors = [];
  if (!fundingUtxo) errors.push({ type: 'btc', msg: `No Bitcoin UTXO with at least ${(formData.lockSats + 5000).toLocaleString()} sats for lock + fees.` });
  if (!hasEnoughAda) errors.push({ type: 'ada', msg: `Insufficient ADA. Need at least 15 ADA, have ${adaDisplay} ADA.` });
  if (!btcAddress) errors.push({ type: 'btc', msg: 'No Bitcoin address found.' });
  const canStart = errors.length === 0;

  const rows = [
    { label: 'Direction', value: 'Bitcoin → Cardano' },
    { label: 'Amount', value: `${formData.lockSats.toLocaleString()} sats` },
    { label: 'You receive', value: `${formData.mintAmount.toLocaleString()} eBTC` },
    { label: 'Destination', value: truncAddr(formData.cardanoAddress) },
    { label: 'ADA balance', value: `${adaDisplay} ADA`, warn: !hasEnoughAda },
  ];
  if (fundingUtxo) rows.push({ label: 'BTC funding', value: `${fundingUtxo.value.toLocaleString()} sats` });

  const handleCopyAddr = async () => {
    if (cardanoAddr) {
      await navigator.clipboard.writeText(cardanoAddr).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Confirm eBTC Beam</h3>
          <button onClick={onClose} className="text-dark-400 hover:text-white text-xl">&times;</button>
        </div>

        <div className="bg-dark-900 rounded-lg p-4 mb-4 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-dark-400">{r.label}</span>
              <span className={`font-mono text-xs ${r.warn ? 'text-red-400 font-semibold' : 'text-white'}`}>{r.value}</span>
            </div>
          ))}
        </div>

        <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 mb-4 text-xs text-blue-300">
          Beaming {formData.lockSats.toLocaleString()} sats to Cardano as {formData.mintAmount.toLocaleString()} eBTC.
          The process takes ~90 min and runs in the background. You can close this page.
        </div>

        {errors.map((e, i) => (
          <div key={i} className={`rounded-lg p-3 mb-3 text-xs ${e.type === 'ada' ? 'bg-amber-900/20 border border-amber-700/30 text-amber-300' : 'bg-red-900/20 border border-red-700/30 text-red-400'}`}>
            {e.msg}
            {e.type === 'ada' && cardanoAddr && (
              <div className="mt-2">
                <div className="text-xs text-dark-400 mb-1">Fund your Cardano address:</div>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-dark-300 break-all flex-1">{cardanoAddr}</code>
                  <button onClick={handleCopyAddr} className="text-xs px-2 py-1 rounded bg-dark-700 text-dark-300 hover:text-white border border-dark-600 flex-shrink-0">
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        <div className="flex gap-3">
          <button
            onClick={() => onConfirm({ lockSats: formData.lockSats, btcAddress, cardanoAddress: formData.cardanoAddress, fundingUtxo })}
            disabled={!canStart}
            className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all ${
              canStart ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-dark-700 text-dark-500 cursor-not-allowed'
            }`}
          >Start Beam</button>
          <button onClick={onBack} className="px-4 py-2.5 rounded-lg text-sm text-dark-300 hover:text-white border border-dark-600 hover:border-dark-500">Back</button>
        </div>
      </div>
    </div>
  );
}

// ── Wizard ───────────────────────────────────────────────────────────────────

export default function EbtcBeamDialog({ onClose }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(null);

  const { seedPhrase } = useWallet();
  const { activeNetwork, activeBlockchain } = useBlockchain();
  const { startEbtcBeam } = useBeamOperations();

  const btcNetwork = activeBlockchain === 'bitcoin' ? activeNetwork : 'mainnet';
  const adaNetwork = activeBlockchain === 'cardano' ? activeNetwork : 'mainnet';

  const handleConfirm = (payload) => {
    const label = `${payload.lockSats.toLocaleString()} sats → eBTC → Cardano`;
    // Always pass our own Cardano address so we pay fees/collateral from our wallet
    const ownCardanoAddress = useCardano.getState().addresses[0]?.address;
    startEbtcBeam(label, {
      lockSats: payload.lockSats,
      btcAddress: payload.btcAddress,
      cardanoAddress: payload.cardanoAddress,         // destination
      cardanoOwnAddress: ownCardanoAddress || payload.cardanoAddress,  // pays fees
      seedPhrase,
      network: btcNetwork,
      adaNetwork,
      // Pre-selected funding UTXO so it gets reserved at beam start (closes
      // the selection-to-broadcast window — the executor used to re-select
      // from mempool during step 2 with no reservation, letting parallel
      // ops re-pick the same UTXO).
      fundingUtxo: payload.fundingUtxo
        ? { utxoId: payload.fundingUtxo.utxoId, value: payload.fundingUtxo.value }
        : undefined,
    });
    onClose();
  };

  if (step === 1) {
    return (
      <EbtcFormStep
        seedPhrase={seedPhrase}
        network={adaNetwork}
        onNext={(data) => { setFormData(data); setStep(2); }}
        onClose={onClose}
      />
    );
  }

  return (
    <EbtcConfirmStep
      formData={formData}
      seedPhrase={seedPhrase}
      network={adaNetwork}
      onConfirm={handleConfirm}
      onBack={() => setStep(1)}
      onClose={onClose}
    />
  );
}

function truncAddr(addr) {
  if (!addr) return '\u2014';
  if (addr.length <= 24) return addr;
  return addr.slice(0, 14) + '...' + addr.slice(-8);
}
