'use client';

import AuthMethodSettings from '@/components/wallet/setup/AuthMethodSettings';
import PortalModal from '@/components/system/PortalModal';

export default function SettingsDialog({ isOpen, onClose }) {
    return (
        <PortalModal isOpen={isOpen} onClose={onClose} title="Settings">
            <div className="space-y-6">
                <AuthMethodSettings />
            </div>
        </PortalModal>
    );
}
