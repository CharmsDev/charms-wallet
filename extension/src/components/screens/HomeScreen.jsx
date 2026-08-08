import { useState, useMemo } from 'react';
import { useCharms } from '@/stores/charmsStore';
import { useUTXOs } from '@/stores/utxoStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { getBroTokenAppId } from '@/services/charms/charms-explorer-api';
import BeamDialog from '@/components/beam/BeamDialog';
import EbtcBeamDialog from '@/components/beam/EbtcBeamDialog';
import AddressCard from '../ui/AddressCard';
import BalanceCards from '../ui/BalanceCards';
import AssetsList from '../ui/AssetsList';
import InTransitList from '../ui/InTransitList';
import SendScreen from '../SendScreen';
import ReceiveScreen from './ReceiveScreen';
import CardanoHomeContent from '../cardano/CardanoHomeContent';
import BeamPanelPopup from '../beam/BeamPanelPopup';

export default function HomeScreen({ primaryAddress, isSyncing, syncPhase, syncUTXOs, onViewAllAssets }) {
  const { isCardano } = useBlockchain();
  const { charms, getTotalByAppId, groupTokensByAppId, getNFTs, isLoading: charmsLoading } = useCharms();
  const { totalBalance, pendingBalance } = useUTXOs();
  const [showSend, setShowSend] = useState(false);
  const [broCharmToBeam, setBroCharmToBeam] = useState(null);
  const [showEbtcBeam, setShowEbtcBeam] = useState(false);

  // Every hook has to run before the Cardano branch returns. Bailing out
  // above these useMemo calls changed the hook count between renders, so
  // toggling the chain toggle threw "Rendered fewer hooks than expected"
  // and blanked the popup.
  const broBalance = useMemo(() => getTotalByAppId(getBroTokenAppId()), [charms, getTotalByAppId]);
  const tokens = useMemo(() => groupTokensByAppId(), [charms, groupTokensByAppId]);
  const nfts = useMemo(() => getNFTs(), [charms, getNFTs]);

  // Cardano variant — popup-sized dashboard backed by @/stores/cardanoStore.
  if (isCardano?.()) {
    return <CardanoHomeContent onViewAllAssets={onViewAllAssets} />;
  }

  // BRO beam-out — match wallet's UserDashboard.handleBeamBro() pattern.
  // Constructs the charm payload shape that @/components/beam/BeamDialog
  // expects: first UTXO + totalAmount + allUtxos array.
  const openBroBeam = () => {
    const broAppId = getBroTokenAppId();
    const broToken = tokens.find((t) => t.appId === broAppId);
    if (!broToken || broToken.tokenUtxos.length === 0) {
      console.warn('[HomeScreen] No BRO charms available to beam');
      return;
    }
    setBroCharmToBeam({
      ...broToken.tokenUtxos[0],
      totalAmount: broToken.totalAmount,
      allUtxos: broToken.tokenUtxos,
    });
  };

  return (
    <div className="p-4 space-y-4">
      <AddressCard address={primaryAddress} />

      <BalanceCards
        totalBalance={totalBalance}
        pendingBalance={pendingBalance}
        broBalance={broBalance}
        isSyncing={isSyncing}
        syncPhase={syncPhase}
      />

      {/* Everything in flight, straight from the BalanceService. */}
      <InTransitList />

      <div className="flex gap-3">
        <button onClick={() => setShowSend(true)} className="btn btn-bitcoin flex-1 py-3">
          <span className="mr-1">↗</span> Send
        </button>
        <ReceiveScreen
          trigger={
            <button className="btn btn-secondary flex-1 py-3">
              <span className="mr-1">↙</span> Receive
            </button>
          }
        />
      </div>

      {/* BRO → Cardano entry-point, only when the user has BRO. */}
      {broBalance > 0 && (
        <button
          onClick={openBroBeam}
          className="w-full py-3 rounded-lg bg-gradient-to-r from-purple-600 to-cardano-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          ↗ Beam BRO to Cardano
        </button>
      )}

      {/* eBTC mint+beam — always available; the dialog itself checks
          BTC + ADA balance and surfaces errors. */}
      {totalBalance > 1000 && (
        <button
          onClick={() => setShowEbtcBeam(true)}
          className="w-full py-3 rounded-lg bg-gradient-to-r from-orange-600 to-cardano-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          🔒 Mint eBTC + Beam to Cardano
        </button>
      )}

      <BeamPanelPopup />

      <div className="card">
        <div className="flex items-center justify-between p-3 border-b border-dark-700">
          <span className="text-sm font-medium text-white">Assets</span>
          <button onClick={onViewAllAssets} className="text-xs text-primary-400 hover:text-primary-300">
            View All →
          </button>
        </div>
        <div className="p-2">
          <AssetsList
            tokens={tokens}
            nfts={nfts}
            isSyncing={isSyncing}
            isLoading={charmsLoading}
            preview
            onViewAll={onViewAllAssets}
          />
        </div>
      </div>

      {showSend && <SendScreen onClose={() => setShowSend(false)} syncUTXOs={syncUTXOs} />}

      {/* BRO beam-out dialog (BTC → Cardano). Wallet's BeamDialog handles
          the 2-step wizard (form + confirm) and calls startBeam() on submit;
          BeamOperationsContext runs the executor. */}
      {broCharmToBeam && (
        <BeamDialog
          charm={broCharmToBeam}
          onClose={() => setBroCharmToBeam(null)}
        />
      )}

      {/* eBTC mint+beam dialog. Pulls seed + UTXOs internally, picks
          funding via selectBtcFunding, derives the Cardano destination,
          and routes through startEbtcBeam → executeEbtcBeam (3-step
          flow ending with the eBTC CNT on Cardano). */}
      {showEbtcBeam && (
        <EbtcBeamDialog onClose={() => setShowEbtcBeam(false)} />
      )}
    </div>
  );
}
