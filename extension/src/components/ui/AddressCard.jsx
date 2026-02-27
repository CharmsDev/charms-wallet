import { useState, useCallback } from 'react';

export default function AddressCard({ address }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [address]);

  return (
    <button
      onClick={copy}
      className="w-full card p-3 flex items-center justify-between hover:border-primary-500/50 transition-colors"
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-primary-500 to-blue-500 flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <div className="text-left">
          <div className="text-xs text-dark-400">Your Address</div>
          <div className="text-sm text-white font-mono">
            {address ? `${address.slice(0, 10)}...${address.slice(-6)}` : 'Loading...'}
          </div>
        </div>
      </div>
      <div className={`text-xs ${copied ? 'text-green-400' : 'text-dark-400'}`}>
        {copied ? '✓ Copied!' : 'Copy'}
      </div>
    </button>
  );
}
