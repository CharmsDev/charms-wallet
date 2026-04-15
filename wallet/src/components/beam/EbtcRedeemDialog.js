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

function RedeemFormStep({ asset, network, onNext, onClose }) {
  const ebtcBalance = parseInt(asset.quantity || '0');
  const [redeemAmount, setRedeemAmount] = useState('');
  const [percentPreset, setPercentPreset] = useState(null);

  const setPercent = (p) => {
    setPercentPreset(p);
    setRedeemAmount(Math.floor(ebtcBalance * p / 100).toString());
  };

  const amt = parseInt(redeemAmount) || 0;
  const isValid = amt > 0 && amt <= ebtcBalance;
  const remainingEbtc = ebtcBalance - amt;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-dark-800 border border-dark-700 rounded-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Redeem eBTC to Bitcoin</h3>
          <button onClick={onClose} className="text-dark-400 hover:text-white text-xl">&times;</button>
        </div>

        <div className="text-xs text-dark-400 mb-4">
          Burn eBTC tokens on Cardano and release the equivalent BTC from the Scrolls vault back to your wallet.
        </div>

        <div className="bg-dark-900 rounded-lg p-3 mb-4">
          <div className="text-xs text-dark-400 mb-1">Available eBTC on Cardano</div>
          <div className="text-xl font-mono text-purple-400">{ebtcBalance.toLocaleString()} eBTC</div>
          <div className="text-xs text-dark-500">= {ebtcBalance.toLocaleString()} sats backed in vault</div>
        </div>

        <div className="mb-4">
          <label className="text-sm text-dark-300 mb-1 block">Amount to redeem</label>
          <input
            type="number"
            value={redeemAmount}
            onChange={e => { setRedeemAmount(e.target.value); setPercentPreset(null); }}
            placeholder="0"
            min={1}
            max={ebtcBalance}
            className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
          />
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
              You will receive {amt.toLocaleString()} sats of real BTC.
              {remainingEbtc > 0 && ` ${remainingEbtc.toLocaleString()} eBTC stays on Cardano.`}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => onNext({ redeemAmount: amt, ebtcBalance, remainingEbtc })}
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
  const { addresses } = useAddresses();
  const cardanoAddr = useCardano(s => s.addresses[0]?.address);
  const adaBalance = useCardano(s => s.adaBalance);
  const cardanoRefresh = useCardano(s => s.refresh);
  const cardanoLoadFromStorage = useCardano(s => s.loadFromStorage);

  const [vaultInfo, setVaultInfo] = useState(null);

  // Refresh both chains on mount
  useEffect(() => {
    refreshUTXOs?.('bitcoin', 'mainnet').catch(() => {});
    cardanoRefresh?.().catch(() => {});
  }, [refreshUTXOs, cardanoRefresh]);

  // Find vault UTXO that backs this CNT — query Scrolls vault address
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`https://mempool.space/api/address/${VAULT_ADDR}/utxo`);
        const vaultUtxos = await resp.json();
        // Pick a vault UTXO ≥ redeemAmount + dust to satisfy the redeem
        const minSats = formData.redeemAmount + DUST_PER_VAULT;
        const candidate = vaultUtxos
          .filter(u => u.status?.confirmed && u.value >= minSats)
          .sort((a, b) => a.value - b.value)[0];
        setVaultInfo({
          totalSats: vaultUtxos.reduce((s, u) => s + u.value, 0),
          utxoCount: vaultUtxos.length,
          selected: candidate,
        });
      } catch (err) {
        console.error('[Redeem] Failed to fetch vault:', err);
      }
    })();
  }, [formData.redeemAmount]);

  const adaLovelace = BigInt(adaBalance || '0');
  const MIN_ADA_LOVELACE = BigInt(10_000_000);
  const hasEnoughAda = adaLovelace >= MIN_ADA_LOVELACE;
  const adaDisplay = (Number(adaLovelace) / 1_000_000).toFixed(2);

  const btcAddress = addresses?.find(a => a.index === 0 && !a.isChange)?.address;
  const btcUtxoList = useMemo(() => {
    return Object.entries(utxos || {}).flatMap(([addr, list]) =>
      (Array.isArray(list) ? list : []).map(u => ({ ...u, address: u.address || addr }))
    );
  }, [utxos]);
  const hasBtcFunding = btcUtxoList.some(u => u.value >= 2000);

  const errors = [];
  if (!hasEnoughAda) errors.push(`Insufficient ADA. Need ≥10 ADA, have ${adaDisplay}`);
  if (!hasBtcFunding) errors.push('No BTC UTXO ≥2000 sats for placeholder');
  if (vaultInfo && !vaultInfo.selected) errors.push(`No vault UTXO ≥ ${formData.redeemAmount + DUST_PER_VAULT} sats. Vault may be fragmented.`);

  const canStart = errors.length === 0 && vaultInfo && cardanoAddr && btcAddress;
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
          <div className="flex justify-between"><span className="text-dark-400">Redeem</span><span className="font-mono text-white">{formData.redeemAmount.toLocaleString()} eBTC</span></div>
          <div className="flex justify-between"><span className="text-dark-400">You receive</span><span className="font-mono text-purple-400">{formData.redeemAmount.toLocaleString()} sats BTC</span></div>
          <div className="flex justify-between"><span className="text-dark-400">eBTC remaining</span><span className="font-mono text-white">{formData.remainingEbtc.toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-dark-400">ADA balance</span><span className={`font-mono text-xs ${!hasEnoughAda ? 'text-red-400' : 'text-white'}`}>{adaDisplay} ADA</span></div>
          {vaultInfo && (
            <>
              <div className="flex justify-between"><span className="text-dark-400">Vault total</span><span className="font-mono text-xs text-white">{vaultInfo.totalSats.toLocaleString()} sats</span></div>
              {vaultInfo.selected && (
                <>
                  <div className="flex justify-between"><span className="text-dark-400">Vault UTXO used</span><span className="font-mono text-xs text-dark-300">{vaultInfo.selected.value.toLocaleString()} sats</span></div>
                  <div className="flex justify-between"><span className="text-dark-400">Vault remaining</span><span className="font-mono text-xs text-white">{remainingVault.toLocaleString()} sats</span></div>
                </>
              )}
            </>
          )}
        </div>

        <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 mb-4 text-xs text-blue-300">
          3-tx flow: BTC placeholder → ADA beam-out → BTC redeem (Scrolls signs vault). Takes ~30-60 min (Mithril finality wait). Runs in background.
        </div>

        {errors.map((e, i) => (
          <div key={i} className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 mb-3 text-xs text-amber-300">{e}</div>
        ))}

        <div className="flex gap-3">
          <button
            onClick={() => onConfirm({
              redeemAmount: formData.redeemAmount,
              ebtcBalance: formData.ebtcBalance,
              cntUtxo: asset._cntUtxoId,
              vaultUtxo: `${vaultInfo.selected.txid}:${vaultInfo.selected.vout}`,
              vaultSats: vaultInfo.selected.value,
              remainingVault,
              btcAddress,
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
  const { seedPhrase } = useWallet();
  const { activeNetwork, activeBlockchain } = useBlockchain();
  const { startEbtcRedeem } = useBeamOperations();

  const btcNetwork = 'mainnet';
  const adaNetwork = 'mainnet';

  const handleConfirm = (payload) => {
    const label = `Redeem ${payload.redeemAmount.toLocaleString()} eBTC → BTC`;
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
        network={adaNetwork}
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
