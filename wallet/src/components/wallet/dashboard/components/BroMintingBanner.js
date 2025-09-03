'use client';

import React from 'react';

const BroMintingBanner = () => {
  const handleMintClick = () => {
    window.open('https://bro.charms.dev', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="relative glass-effect p-4 rounded-lg flex items-center justify-between overflow-hidden border border-primary-500/50 animate-pulse-glow">
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
      <div className="flex items-center space-x-4">
        <img 
          src="https://bro.charms.dev/assets/bro-token-DsXLIv23.jpg" 
          alt="Bro Token" 
          className="h-10 w-10 rounded-full object-cover"
        />
        <div>
          <h3 className="text-lg font-bold text-white">BRO Minting is Live!</h3>
          <p className="text-sm text-dark-300">Mint now at <span className="font-bold text-primary-400">bro.charms.dev</span></p>
        </div>
      </div>
      <button
        onClick={handleMintClick}
        className="bg-primary-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-primary-600 transition-colors duration-300 shadow-lg shadow-primary-500/30"
      >
        Go Mint
      </button>
    </div>
  );
};

export default BroMintingBanner;
