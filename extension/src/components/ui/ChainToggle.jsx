/**
 * Compact chain toggle for the popup header. Two pill-shaped buttons
 * (BTC / ADA) that switch `useBlockchain.setActiveBlockchain()`. Network
 * stays in sync via the existing NetworkContext + the blockchainStore
 * persistence on switch.
 */

import { useBlockchain, BLOCKCHAINS } from '@/stores/blockchainStore';

export default function ChainToggle() {
  const { activeBlockchain, setActiveBlockchain } = useBlockchain();

  const cls = (active) =>
    `text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
      active
        ? 'bg-primary-500/30 text-primary-200 border border-primary-500/50'
        : 'text-dark-400 hover:text-dark-200 border border-transparent'
    }`;

  return (
    <div className="flex items-center gap-1 bg-dark-800/60 rounded-full p-0.5">
      <button
        onClick={() => {
          console.log('[ChWlt chain] switch → bitcoin');
          setActiveBlockchain?.(BLOCKCHAINS.BITCOIN);
        }}
        className={cls(activeBlockchain === BLOCKCHAINS.BITCOIN)}
        title="Bitcoin"
      >
        BTC
      </button>
      <button
        onClick={() => {
          console.log('[ChWlt chain] switch → cardano');
          setActiveBlockchain?.(BLOCKCHAINS.CARDANO);
        }}
        className={cls(activeBlockchain === BLOCKCHAINS.CARDANO)}
        title="Cardano"
      >
        ADA
      </button>
    </div>
  );
}
