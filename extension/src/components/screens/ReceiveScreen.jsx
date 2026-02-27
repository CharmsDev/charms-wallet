import { useState } from 'react';
import { useAddresses } from '@/stores/addressesStore';
import { useNetwork } from '@/contexts/NetworkContext';
import { useReceiveAddress } from '../../hooks/useReceiveAddress';
import { useBlockchain } from '@/stores/blockchainStore';

function BackButton({ onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-dark-300 hover:text-white transition-colors">
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      <span className="text-sm">Back</span>
    </button>
  );
}

export default function ReceiveScreen({ trigger }) {
  const [isOpen, setIsOpen] = useState(false);
  const { addresses, addAddress } = useAddresses();
  const { activeNetwork } = useNetwork();
  const { activeBlockchain } = useBlockchain();

  const { receiveAddress, receiveIndex, isGenerating, copied, open, generateNext, copyAddress } =
    useReceiveAddress({ activeBlockchain, activeNetwork, addresses, addAddress });

  const handleOpen = async () => {
    setIsOpen(true);
    await open();
  };

  return (
    <>
      <div onClick={handleOpen}>{trigger}</div>

      {isOpen && (
        <div className="absolute inset-0 z-50 flex flex-col bg-dark-950">
          <header className="glass-effect flex items-center justify-between px-4 py-3 border-b border-dark-700">
            <BackButton onClick={() => setIsOpen(false)} />
            <span className="font-semibold gradient-text">Receive</span>
            <div className="w-16" />
          </header>

          <div className="flex-1 overflow-auto p-4 flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-primary-500 to-blue-500 flex items-center justify-center mb-4 mt-2">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>

            <h2 className="text-lg font-bold text-white mb-1">Your Receive Address</h2>
            <p className="text-xs text-dark-400 text-center mb-5 px-4 leading-relaxed">
              Send <span className="text-bitcoin-500 font-medium">Bitcoin</span>,{' '}
              <span className="text-purple-400 font-medium">Charms</span>,{' '}
              <span className="text-purple-400 font-medium">$BRO tokens</span>{' '}
              or any other asset to this address.
            </p>

            <div className="w-full card p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary-500" />
                  <span className="text-xs font-medium text-primary-400">Taproot (P2TR)</span>
                </div>
                <span className="text-xs text-dark-500">BIP-86 #{receiveIndex}</span>
              </div>
              {isGenerating ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <p onClick={copyAddress} className="text-sm font-mono text-white break-all leading-relaxed cursor-pointer hover:text-primary-300 transition-colors">
                  {receiveAddress}
                </p>
              )}
            </div>

            <button
              onClick={copyAddress}
              disabled={isGenerating || !receiveAddress}
              className={`w-full py-3 rounded-xl text-sm font-semibold transition-all mb-3 ${
                copied
                  ? 'bg-green-600/20 border border-green-500/50 text-green-400'
                  : 'bg-gradient-to-r from-primary-500 to-blue-500 text-white hover:shadow-lg hover:shadow-primary-500/25'
              } disabled:opacity-50`}
            >
              {copied ? '✓ Copied to clipboard!' : 'Copy Address'}
            </button>

            <button
              onClick={generateNext}
              disabled={isGenerating}
              className="w-full py-3 rounded-xl text-sm font-medium bg-dark-800 border border-dark-600 text-dark-300 hover:bg-dark-700 hover:text-white transition-all disabled:opacity-50 mb-6"
            >
              {isGenerating ? 'Generating...' : 'Generate New Address'}
            </button>

            <div className="w-full card p-3 bg-dark-800/50">
              <p className="text-xs text-dark-400 leading-relaxed">
                New addresses are derived from your seed phrase. Previous addresses remain active.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
