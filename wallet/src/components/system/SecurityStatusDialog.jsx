'use client';

/**
 * SecurityStatusDialog — modal wrapper around the existing
 * SecurityStatus widget. Accessed from the header account menu so the
 * dashboard body no longer carries it.
 */

import SecurityStatus from '@/components/wallet/dashboard/components/SecurityStatus';

export default function SecurityStatusDialog({ isOpen, onClose, hasWallet, seedPhrase }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-start sm:items-center justify-center z-[10001] overflow-y-auto py-20 sm:py-12">
      <div className="bg-dark-900 rounded-lg w-full max-w-lg mx-4 my-auto border border-white/20">
        <div className="flex justify-between items-center px-6 pt-6 pb-3">
          <h2 className="text-xl font-semibold gradient-text">Security</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 pb-6">
          <SecurityStatus hasWallet={hasWallet} seedPhrase={seedPhrase} />
        </div>
      </div>
    </div>
  );
}
