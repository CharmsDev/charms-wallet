'use client';

import React from 'react';

const BroMintingBanner = () => {
  const handleClick = () => {
    window.open('https://cast.charms.dev', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="relative glass-effect p-4 rounded-lg overflow-hidden border border-primary-500/50 animate-pulse-glow">
      <style jsx>{`
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 5px rgba(255, 159, 0, 0.3), 0 0 10px rgba(255, 159, 0, 0.2);
          }
          50% {
            box-shadow: 0 0 15px rgba(255, 159, 0, 0.6), 0 0 25px rgba(255, 159, 0, 0.4);
          }
        }
        .animate-pulse-glow {
          animation: pulse-glow 3s infinite ease-in-out;
        }
      `}</style>
      <div className="flex items-start space-x-3">
        <div className="h-10 w-10 rounded-full bg-bitcoin-500/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-bitcoin-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <div className="flex-1 space-y-2">
          <h3 className="text-base font-bold text-white">Cast DEX is Live!</h3>
          <p className="text-sm text-dark-300">
            Trade $BRO on <span className="font-bold text-primary-400">cast.charms.dev</span>
          </p>
          <button
            onClick={handleClick}
            className="w-full bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition-colors duration-300 shadow-lg shadow-primary-500/30 text-sm"
          >
            Start Trading
          </button>
        </div>
      </div>
    </div>
  );
};

export default BroMintingBanner;
