'use client';

/**
 * DeleteWalletDialog — irreversible delete confirmation, extracted
 * from SettingsDialog so the header account menu can trigger it
 * directly without nested modals.
 */

import { useState } from 'react';
import { clearAllWalletData } from '@/services/storage';

export default function DeleteWalletDialog({ isOpen, onClose }) {
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const onDelete = async () => {
    setBusy(true);
    try {
      await clearAllWalletData();
      onClose();
      window.location.reload();
    } catch (err) {
      console.error('Failed to delete wallet:', err);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-start sm:items-center justify-center z-[10001] overflow-y-auto py-20 sm:py-12">
      <div className="bg-dark-900 rounded-lg p-6 w-full max-w-lg mx-4 my-auto border border-red-500/30">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-red-400">Delete wallet</h2>
          <button onClick={onClose} disabled={busy} className="text-gray-400 hover:text-white disabled:opacity-50">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-gray-300 text-sm mb-4">
          This will permanently remove from this device:
        </p>
        <ul className="text-gray-300 text-sm mb-4 space-y-1 ml-4">
          <li>• Your seed phrase and private keys (encrypted or plaintext)</li>
          <li>• All addresses, UTXOs, transaction history</li>
          <li>• Charms cache and settings</li>
        </ul>
        <p className="text-yellow-400 text-sm mb-6">
          ⚠️ You will lose access to your funds unless you have your seed
          phrase backed up offline. There is no recovery from this device
          after deletion.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 bg-dark-700 hover:bg-dark-600 text-white py-2 px-4 rounded transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded transition-colors disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Delete wallet'}
          </button>
        </div>
      </div>
    </div>
  );
}
