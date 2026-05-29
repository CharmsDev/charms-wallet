'use client';

/**
 * DeleteWalletDialog — irreversible delete confirmation, triggered
 * from the header account menu. Uses the shared PortalModal shell.
 */

import { useState } from 'react';
import { clearAllWalletData } from '@/services/storage';
import PortalModal from './PortalModal';

export default function DeleteWalletDialog({ isOpen, onClose }) {
  const [busy, setBusy] = useState(false);

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
    <PortalModal isOpen={isOpen} onClose={onClose} title="Delete wallet" accent="danger" closable={!busy}>
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
    </PortalModal>
  );
}
