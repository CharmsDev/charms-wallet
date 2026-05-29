'use client';

/**
 * SecurityStatusDialog — modal wrapper around the existing
 * SecurityStatus widget. Uses the shared PortalModal shell.
 */

import SecurityStatus from '@/components/wallet/dashboard/components/SecurityStatus';
import PortalModal from './PortalModal';

export default function SecurityStatusDialog({ isOpen, onClose, hasWallet, seedPhrase }) {
  return (
    <PortalModal isOpen={isOpen} onClose={onClose} title="Security">
      <SecurityStatus hasWallet={hasWallet} seedPhrase={seedPhrase} />
    </PortalModal>
  );
}
