'use client';

/**
 * Cardano address display card with copy-to-clipboard.
 */

import { useState } from 'react';
import { cardanoAddressUrl } from '@/utils/cardanoExplorer';

export default function CardanoAddressCard({ addr, network }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(addr.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const explorerUrl = cardanoAddressUrl(addr.address, network);

  return (
    <div className="bg-dark-900/50 rounded-lg p-3 mb-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-dark-400">
          Payment Address #{addr.index}
        </span>
        <div className="flex items-center gap-2">
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-400 hover:underline"
          >
            Explorer
          </a>
          <button
            onClick={handleCopy}
            className="text-xs text-dark-400 hover:text-white transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
      <div className="font-mono text-xs text-dark-300 break-all">
        {addr.address}
      </div>
    </div>
  );
}
