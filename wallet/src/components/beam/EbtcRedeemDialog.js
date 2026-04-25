'use client';

/**
 * eBTC Redeem Dialog — 2-step wizard for ADA → BTC redeem.
 *
 * User selects how much eBTC to redeem (% of available CNT balance).
 * Flow uses 3 txs: BTC placeholder → ADA beam-out → BTC combined claim+burn+release.
 */

import { useState, useMemo, useEffect } from 'react';
import { useBeamOperations } from '@/contexts/BeamOperationsContext';
import { useWallet } from '@/stores/walletStore';
import { useUTXOs } from '@/stores/utxoStore';
import { useAddresses } from '@/stores/addressesStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useCharms } from '@/stores/charmsStore';
import { useCardano } from '@/stores/cardanoStore';

const EBTC_POLICY_ID = '552b22f4989ea698fabbf6314b70d2e5edb49c1fdbdeb6096e8c84b6';
const VAULT_ADDR = 'bc1qrn970793udj0ugc3pj0hyrptts4rw5n7qxeya2';
const DUST_PER_VAULT = 300;

// ── Step 1: Form ────────────────────────────────────────────────────────────

function RedeemFormStep({ asset, ownBtcAddress, onNext, onClose }) {
  const ebtcBalance = parseInt(asset.quantity || '0');
  const [redeemAmount, setRedeemAmount] = useState('');
  const [percentPreset, setPercentPreset] = useState(null);
  const [useOwnAddress, setUseOwnAddress] = useState(true);
  const [customAddress, setCustomAddress] = useState('');

  const setPercent = (p) => {
    setPercentPreset(p);
    setRedeemAmount(Math.floor(ebtcBalance * p / 100).toString());
  };

  const amt = parseInt(redeemAmount) || 0;
  const destAddress = useOwnAddress ? ownBtcAddress : customAddress;
  const isAddressValid = destAddress && (destAddress.startsWith('bc1') || destAddress.startsWith('tb1'));
  const isValid = amt > 0 && amt <= ebtcBalance && isAddressValid;
  const remainingEbtc = ebtcBalance - amt;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Redeem eBTC to Bitcoin</h3>
          <button onClick={onClose} className="text-dark-400 hover:text-white text-xl">&times;</button>
        </div>

        <div className="text-xs text-dark-400 mb-4">
          Move your eBTC from Cardano back to Bitcoin. BTC will be sent to the destination address.
        </div>

        <div className="bg-dark-900 rounded-lg p-3 mb-4">
          <div className="text-xs text-dark-400 mb-1">Available eBTC on Cardano</div>
          <div className="text-xl font-mono text-purple-400">{(ebtcBalance / 1e8).toFixed(8)} eBTC</div>
          <div className="text-xs text-dark-500 font-mono">= {ebtcBalance.toLocaleString()} sats</div>
        </div>

        <div className="mb-4">
          <label className="text-sm text-dark-300 mb-1 block">Amount to redeem (sats)</label>
          <input
            type="number"
            value={redeemAmount}
            onChange={e => { setRedeemAmount(e.target.value); setPercentPreset(null); }}
            placeholder="0"
            min={1}
            max={ebtcBalance}
            className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
          />
          {amt > 0 && (
            <div className="text-xs text-dark-500 font-mono mt-1">= {(amt / 1e8).toFixed(8)} BTC</div>
          )}
          <div className="flex gap-2 mt-2">
            {[25, 50, 75, 100].map(p => (
              <button
                key={p}
                onClick={() => setPercent(p)}
                className={`px-3 py-1 rounded text-xs ${percentPreset === p ? 'bg-purple-600 text-white' : 'bg-dark-700 text-dark-400 hover:text-white'}`}
              >{p}%</button>
            ))}
          </div>
          {amt > 0 && (
            <div className="text-xs text-purple-400 mt-2">
              You will receive {(amt / 1e8).toFixed(8)} BTC ({amt.toLocaleString()} sats).
              {remainingEbtc > 0 && ` ${(remainingEbtc / 1e8).toFixed(8)} eBTC stays on Cardano.`}
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="text-sm text-dark-300 mb-2 block">Destination address</label>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => { setUseOwnAddress(true); setCustomAddress(''); }}
              className={`px-3 py-1 rounded text-xs ${useOwnAddress ? 'bg-purple-600 text-white' : 'bg-dark-700 text-dark-400'}`}
            >My Wallet</button>
            <button
              onClick={() => setUseOwnAddress(false)}
              className={`px-3 py-1 rounded text-xs ${!useOwnAddress ? 'bg-purple-600 text-white' : 'bg-dark-700 text-dark-400'}`}
            >Other</button>
          </div>
          {!useOwnAddress && (
            <input
              value={customAddress}
              onChange={e => setCustomAddress(e.target.value)}
              placeholder="bc1..."
              className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-purple-500 focus:outline-none"
            />
          )}
          {useOwnAddress && ownBtcAddress && (
            <div className="text-xs text-dark-500 font-mono truncate">{ownBtcAddress}</div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => onNext({ redeemAmount: amt, ebtcBalance, remainingEbtc, destAddress })}
            disabled={!isValid}
            className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all ${
              isValid ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-dark-700 text-dark-500 cursor-not-allowed'
            }`}
          >Next</button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm text-dark-300 hover:text-white border border-dark-600">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Confirm ─────────────────────────────────────────────────────────

function RedeemConfirmStep({ asset, formData, seedPhrase, network, onConfirm, onBack, onClose }) {
  const { utxos, refreshUTXOs } = useUTXOs();
  const cardanoAddr = useCardano(s => s.addresses[0]?.address);
  const adaBalance = useCardano(s => s.adaBalance);
  const cardanoRefresh = useCardano(s => s.refresh);

  const [vaultInfo, setVaultInfo] = useState(null);
  const [btcAddress, setBtcAddress] = useState('');
  const [btcUtxos, setBtcUtxos] = useState([]);

  // Load BTC address + fresh UTXOs (Cardano tab has no BTC addresses in
  // useAddresses). Routes through mempoolService so Explorer API is preferred
  // and we don't hit direct-from-browser CORS on mempool.space.
  useEffect(() => {
    (async () => {
      try {
        const { getAddresses } = await import('@/services/storage');
        const { mempoolService } = await import('@/services/shared/mempool-service');
        const stored = await getAddresses('bitcoin', 'mainnet');
        const addr = stored?.find(a => a.index === 0 && !a.isChange)?.address || stored?.[0]?.address;
        if (addr) {
          setBtcAddress(addr);
          const { utxos } = await mempoolService.getAddressUTXOs(addr, 'mainnet');
          setBtcUtxos((utxos || []).filter(u => u.status?.confirmed));
        }
      } catch {}
    })();
    refreshUTXOs?.('bitcoin', 'mainnet').catch(() => {});
    cardanoRefresh?.().catch(() => {});
  }, [refreshUTXOs, cardanoRefresh]);

  // Find vault UTXO that backs this CNT — query Scrolls vault address
  useEffect(() => {
    (async () => {
      try {
        const { mempoolService } = await import('@/services/shared/mempool-service');
        const { utxos: vaultUtxos } = await mempoolService.getAddressUTXOs(VAULT_ADDR, 'mainnet');
        // Pick a vault UTXO ≥ redeemAmount + dust to satisfy the redeem
        const minSats = formData.redeemAmount + DUST_PER_VAULT;
        const confirmed = (vaultUtxos || []).filter(u => u.status?.confirmed);
        const candidate = confirmed
          .filter(u => u.value >= minSats)
          .sort((a, b) => a.value - b.value)[0];
        setVaultInfo({
          totalSats: confirmed.reduce((s, u) => s + u.value, 0),
          utxoCount: confirmed.length,
          selected: candidate,
        });
      } catch (err) {
        console.error('[Redeem] Failed to fetch vault:', err);
      }
    })();
  }, [formData.redeemAmount]);

  const adaLovelace = BigInt(adaBalance || '0');
  const MIN_ADA_LOVELACE = BigInt(15_000_000);
  const hasEnoughAda = adaLovelace >= MIN_ADA_LOVELACE;
  const adaDisplay = (Number(adaLovelace) / 1_000_000).toFixed(2);

  // Pick BTC funding UTXOs. Scrolls fee scales with total_input_sats
  // (formula: 895 + 64*ins + 10bps of total). So we pick the SMALLEST
  // combination clearing the target, not the largest. Prefer a single
  // UTXO just above target → keeps total_input compact.
  const FUNDING_TARGET = 6000;
  const MIN_PLACEHOLDER_SATS = 2000;
  const fundingSelection = useMemo(() => {
    const confirmed = btcUtxos.filter(u => u.status?.confirmed !== false);
    const totalAvailable = confirmed.reduce((s, u) => s + u.value, 0);
    // Smallest-first sort
    const sorted = [...confirmed].sort((a, b) => a.value - b.value);
    const picked = [];
    let total = 0;
    // Preferred: single smallest UTXO that clears target alone
    const singleSufficient = sorted.find(u => u.value >= FUNDING_TARGET);
    if (singleSufficient) {
      picked.push(singleSufficient);
      total = singleSufficient.value;
    } else {
      // Fallback: accumulate smallest-first
      for (const u of sorted) {
        if (total >= FUNDING_TARGET) break;
        picked.push(u);
        total += u.value;
      }
    }
    return { picked, total, totalAvailable, sufficient: total >= FUNDING_TARGET };
  }, [btcUtxos]);
  const placeholderUtxo = useMemo(() => {
    // Any UTXO ≥ placeholder min, not among funding picks
    const fundIds = new Set(fundingSelection.picked.map(f => `${f.txid}:${f.vout}`));
    return btcUtxos.find(u => !fundIds.has(`${u.txid}:${u.vout}`) && u.value >= MIN_PLACEHOLDER_SATS)
      || fundingSelection.picked[0];
  }, [btcUtxos, fundingSelection]);

  const errors = [];
  if (!hasEnoughAda) errors.push(`Insufficient ADA. Need ≥15 ADA, have ${adaDisplay}`);
  if (btcAddress && !fundingSelection.sufficient) {
    const deficit = FUNDING_TARGET - fundingSelection.totalAvailable;
    errors.push(`Insufficient BTC for fees. You have ${fundingSelection.totalAvailable} sats, need ${FUNDING_TARGET}. Add ~${deficit} sats to your wallet.`);
  }
  if (vaultInfo && !vaultInfo.selected) errors.push(`No vault UTXO available. Vault may be fragmented.`);

  const canStart = errors.length === 0 && vaultInfo?.selected && cardanoAddr && btcAddress && fundingSelection.sufficient;
  const remainingVault = vaultInfo?.selected ? vaultInfo.selected.value - formData.redeemAmount : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Confirm Redeem</h3>
          <button onClick={onClose} className="text-dark-400 hover:text-white text-xl">&times;</button>
        </div>

        <div className="bg-dark-900 rounded-lg p-4 mb-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-dark-400">Direction</span><span className="text-white">Cardano → Bitcoin</span></div>
          <div className="flex justify-between"><span className="text-dark-400">Amount</span><span className="font-mono text-white">{(formData.redeemAmount / 1e8).toFixed(8)} eBTC</span></div>
          <div className="flex justify-between"><span className="text-dark-400">You receive</span><span className="font-mono text-purple-400">{(formData.redeemAmount / 1e8).toFixed(8)} BTC</span></div>
          {formData.remainingEbtc > 0 && (
            <div className="flex justify-between"><span className="text-dark-400">eBTC remaining</span><span className="font-mono text-white">{(formData.remainingEbtc / 1e8).toFixed(8)}</span></div>
          )}
          <div className="flex justify-between items-start gap-2"><span className="text-dark-400 shrink-0">Destination</span><span className="font-mono text-xs text-white break-all text-right">{formData.destAddress}</span></div>
          <div className="flex justify-between"><span className="text-dark-400">ADA balance</span><span className={`font-mono text-xs ${!hasEnoughAda ? 'text-red-400' : 'text-white'}`}>{adaDisplay} ADA</span></div>
        </div>

        <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 mb-4 text-xs text-blue-300">
          Takes ~30-60 minutes to complete. The process runs in the background — you can close this page.
        </div>

        {errors.map((e, i) => (
          <div key={i} className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 mb-3 text-xs text-amber-300">{e}</div>
        ))}

        <div className="flex gap-3">
          <button
            onClick={() => onConfirm({
              redeemAmount: formData.redeemAmount,
              ebtcBalance: formData.ebtcBalance,
              cntUtxoId: asset._cntUtxoId,
              vaultUtxo: `${vaultInfo.selected.txid}:${vaultInfo.selected.vout}`,
              vaultSats: vaultInfo.selected.value,
              remainingVault,
              btcFundingUtxos: fundingSelection.picked.map(u => ({ utxo: `${u.txid}:${u.vout}`, sats: u.value })),
              // Legacy single-field for backward compat (first pick)
              btcFundingUtxo: fundingSelection.picked[0] ? `${fundingSelection.picked[0].txid}:${fundingSelection.picked[0].vout}` : null,
              btcFundingSats: fundingSelection.picked[0]?.value || null,
              btcAddress: formData.destAddress,
              btcOwnAddress: btcAddress,
              cardanoAddress: cardanoAddr,
              cardanoOwnAddress: cardanoAddr,
            })}
            disabled={!canStart}
            className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all ${
              canStart ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-dark-700 text-dark-500 cursor-not-allowed'
            }`}
          >Start Redeem</button>
          <button onClick={onBack} className="px-4 py-2.5 rounded-lg text-sm text-dark-300 hover:text-white border border-dark-600">Back</button>
        </div>
      </div>
    </div>
  );
}

// ── Wizard ───────────────────────────────────────────────────────────────────

export default function EbtcRedeemDialog({ asset, onClose }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(null);
  const [ownBtcAddress, setOwnBtcAddress] = useState('');
  const { seedPhrase } = useWallet();
  const { activeNetwork, activeBlockchain } = useBlockchain();
  const { startEbtcRedeem } = useBeamOperations();

  const btcNetwork = 'mainnet';
  const adaNetwork = 'mainnet';

  // Load BTC address from storage (user may be on Cardano tab; addressesStore
  // only holds the active blockchain's addresses).
  useEffect(() => {
    (async () => {
      try {
        const { getAddresses } = await import('@/services/storage');
        const stored = await getAddresses('bitcoin', btcNetwork);
        const addr = stored?.find(a => a.index === 0 && !a.isChange)?.address || stored?.[0]?.address;
        if (addr) setOwnBtcAddress(addr);
      } catch {}
    })();
  }, []);

  const handleConfirm = (payload) => {
    const label = `${(payload.redeemAmount / 1e8).toFixed(8)} eBTC → Bitcoin`;
    startEbtcRedeem(label, {
      ...payload,
      seedPhrase,
      network: btcNetwork,
      adaNetwork,
    });
    onClose();
  };

  if (step === 1) {
    return (
      <RedeemFormStep
        asset={asset}
        ownBtcAddress={ownBtcAddress}
        onNext={(data) => { setFormData(data); setStep(2); }}
        onClose={onClose}
      />
    );
  }

  return (
    <RedeemConfirmStep
      asset={asset}
      formData={formData}
      seedPhrase={seedPhrase}
      network={btcNetwork}
      onConfirm={handleConfirm}
      onBack={() => setStep(1)}
      onClose={onClose}
    />
  );
}
