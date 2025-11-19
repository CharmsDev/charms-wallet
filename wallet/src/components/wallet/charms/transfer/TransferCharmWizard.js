'use client';

import { useState } from 'react';
import TransferFormDialog from './TransferFormDialog';
import TransferConfirmDialog from './TransferConfirmDialog';
import TransferProcessDialog from './TransferProcessDialog';

/**
 * Transfer Charm Wizard
 * Orchestrates the 3-step transfer process:
 * 1. Form (address + amount)
 * 2. Confirmation (review UTXOs, spell, etc.)
 * 3. Process (automated proving, signing, broadcasting)
 */
export default function TransferCharmWizard({ charm, show, onClose }) {
    const [step, setStep] = useState(1); // 1, 2, 3
    const [transferData, setTransferData] = useState(null);
    const [confirmData, setConfirmData] = useState(null);

    if (!show) return null;

    const handleFormNext = (data) => {
        setTransferData(data);
        setStep(2);
    };

    const handleConfirmBack = () => {
        setStep(1);
    };

    const handleConfirmNext = (data) => {
        setConfirmData(data);
        setStep(3);
    };

    const handleClose = () => {
        // Reset state
        setStep(1);
        setTransferData(null);
        setConfirmData(null);
        onClose();
    };

    return (
        <>
            {step === 1 && (
                <TransferFormDialog
                    charm={charm}
                    onNext={handleFormNext}
                    onClose={handleClose}
                />
            )}

            {step === 2 && transferData && (
                <TransferConfirmDialog
                    charm={charm}
                    transferData={transferData}
                    onConfirm={handleConfirmNext}
                    onBack={handleConfirmBack}
                    onClose={handleClose}
                />
            )}

            {step === 3 && confirmData && (
                <TransferProcessDialog
                    charm={charm}
                    confirmData={confirmData}
                    onClose={handleClose}
                />
            )}
        </>
    );
}
