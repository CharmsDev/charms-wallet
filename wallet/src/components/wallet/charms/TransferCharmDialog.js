'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useUTXOs } from '@/stores/utxoStore';
import { useCharms } from '@/stores/charmsStore';
import { ProcessedCharm } from '@/types';

// Step components
import CharmDetailsStep from './transfer-steps/CharmDetailsStep';
import SpellJsonStep from './transfer-steps/SpellJsonStep';
import ProveSpellStep from './transfer-steps/ProveSpellStep';
import SignatureStep from './transfer-steps/SignatureStep';
import BroadcastStep from './transfer-steps/BroadcastStep';

export default function TransferCharmDialog({ charm, show, onClose }) {
    // State for the transfer process
    const [currentStep, setCurrentStep] = useState(0);
    const [transferAmount, setTransferAmount] = useState(charm.amount.remaining);
    const [destinationAddress, setDestinationAddress] = useState('');
    const [logMessages, setLogMessages] = useState([]);
    const [spellTemplate, setSpellTemplate] = useState('');
    const [finalSpell, setFinalSpell] = useState('');
    const [commitTxHex, setCommitTxHex] = useState(null);
    const [spellTxHex, setSpellTxHex] = useState(null);
    const [signedCommitTx, setSignedCommitTx] = useState(null);
    const [signedSpellTx, setSignedSpellTx] = useState(null);
    const [transactionResult, setTransactionResult] = useState(null);

    // Hooks
    const { seedPhrase } = useWallet();
    const { utxos } = useUTXOs();
    const { isNFT } = useCharms();

    // Check if the charm is an NFT
    const isNftCharm = isNFT(charm);

    // Ensure NFTs always transfer the full amount (RJJ-TODO review how do we apply metadata standard)
    useEffect(() => {
        if (isNftCharm) {
            setTransferAmount(charm.amount.remaining);
        } else if (transferAmount > charm.amount.remaining) {
            setTransferAmount(charm.amount.remaining);
        }
    }, [isNftCharm, charm.amount.remaining, transferAmount]);

    // Check if form is valid for creating transactions
    // For NFTs, we only need a valid destination address since they're always transferred as whole units
    const isFormValid = !!destinationAddress?.trim() && (isNftCharm || transferAmount > 0);

    // Add a message to the log
    const addLogMessage = (message) => {
        setLogMessages(prev => [...prev, message]);
    };

    // Handle next step
    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    };

    // Handle previous step
    const handlePrevious = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    // Handle close
    const handleClose = () => {
        // Reset all state
        setCurrentStep(0);
        setTransferAmount(charm.amount.remaining);
        setDestinationAddress('');
        setLogMessages([]);
        setSpellTemplate('');
        setFinalSpell('');
        setCommitTxHex(null);
        setSpellTxHex(null);
        setSignedCommitTx(null);
        setSignedSpellTx(null);
        setTransactionResult(null);
        onClose();
    };

    // Define the steps
    const steps = [
        {
            title: 'Charm Details',
            component: (
                <CharmDetailsStep
                    charm={charm}
                    transferAmount={transferAmount}
                    setTransferAmount={setTransferAmount}
                    destinationAddress={destinationAddress}
                    setDestinationAddress={setDestinationAddress}
                    isNftCharm={isNftCharm}
                    isFormValid={isFormValid}
                    setSpellTemplate={setSpellTemplate}
                    setFinalSpell={setFinalSpell}
                />
            )
        },
        {
            title: 'Spell JSON',
            component: (
                <SpellJsonStep
                    spellTemplate={spellTemplate}
                    finalSpell={finalSpell}
                    setFinalSpell={setFinalSpell}
                    logMessages={logMessages}
                />
            )
        },
        {
            title: 'Prove Spell',
            component: (
                <ProveSpellStep
                    charm={charm}
                    destinationAddress={destinationAddress}
                    transferAmount={transferAmount}
                    finalSpell={finalSpell}
                    addLogMessage={addLogMessage}
                    setCommitTxHex={setCommitTxHex}
                    setSpellTxHex={setSpellTxHex}
                    setTransactionResult={setTransactionResult}
                    commitTxHex={commitTxHex}
                    spellTxHex={spellTxHex}
                    handleNext={handleNext}
                />
            )
        },
        {
            title: 'Sign Transactions',
            component: (
                <SignatureStep
                    transactionResult={transactionResult}
                    seedPhrase={seedPhrase}
                    addLogMessage={addLogMessage}
                    setSignedCommitTx={setSignedCommitTx}
                    setSignedSpellTx={setSignedSpellTx}
                    signedCommitTx={signedCommitTx}
                    signedSpellTx={signedSpellTx}
                />
            )
        },
        {
            title: 'Broadcast',
            component: (
                <BroadcastStep
                    signedCommitTx={signedCommitTx}
                    signedSpellTx={signedSpellTx}
                    addLogMessage={addLogMessage}
                    charm={charm}
                />
            )
        }
    ];

    // If not showing, return null
    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="bg-blue-500 text-white px-6 py-4 flex justify-between items-center">
                    <h3 className="text-lg font-semibold">
                        {steps[currentStep].title} - Transfer Charm
                    </h3>
                    <button
                        onClick={handleClose}
                        className="text-white hover:text-gray-200"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-grow">
                    {steps[currentStep].component}
                </div>

                {/* Footer with navigation buttons */}
                <div className="bg-gray-100 px-6 py-4 flex justify-between">
                    <button
                        onClick={handlePrevious}
                        disabled={currentStep === 0}
                        className={`px-4 py-2 rounded ${currentStep === 0
                            ? 'bg-gray-300 cursor-not-allowed'
                            : 'bg-blue-500 text-white hover:bg-blue-600'
                            }`}
                    >
                        Previous
                    </button>

                    <div className="flex space-x-2">
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                        >
                            Cancel
                        </button>

                        <button
                            onClick={handleNext}
                            disabled={currentStep === steps.length - 1 ||
                                (currentStep === 0 && !isFormValid) ||
                                (currentStep === 2 && !commitTxHex) ||
                                (currentStep === 3 && !signedCommitTx)}
                            className={`px-4 py-2 rounded ${currentStep === steps.length - 1 ||
                                (currentStep === 0 && !isFormValid) ||
                                (currentStep === 2 && !commitTxHex) ||
                                (currentStep === 3 && !signedCommitTx)
                                ? 'bg-gray-300 cursor-not-allowed'
                                : 'bg-blue-500 text-white hover:bg-blue-600'
                                }`}
                        >
                            {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
