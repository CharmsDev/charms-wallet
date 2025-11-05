'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useUTXOs } from '@/stores/utxoStore';
import { useCharms } from '@/stores/charmsStore';
import { CharmObj } from '@/types';

import CharmDetailsStep from './transfer-steps/CharmDetailsStep';
import SpellJsonStep from './transfer-steps/SpellJsonStep';
import ProveSpellStep from './transfer-steps/ProveSpellStep';
import SignatureStep from './transfer-steps/SignatureStep';
import BroadcastStep from './transfer-steps/BroadcastStep';

export default function TransferCharmDialog({ charm, show, onClose }) {
    const [currentStep, setCurrentStep] = useState(0);
    const [transferAmount, setTransferAmount] = useState(charm?.amount || 0);
    const [destinationAddress, setDestinationAddress] = useState('');
    const [logMessages, setLogMessages] = useState([]);
    const [spellTemplate, setSpellTemplate] = useState('');
    const [finalSpell, setFinalSpell] = useState('');
    const [commitTxHex, setCommitTxHex] = useState(null);
    const [spellTxHex, setSpellTxHex] = useState(null);
    const [signedCommitTx, setSignedCommitTx] = useState(null);
    const [signedSpellTx, setSignedSpellTx] = useState(null);
    const [transactionResult, setTransactionResult] = useState(null);
    const [broadcastComplete, setBroadcastComplete] = useState(false);

    // Store hooks
    const { seedPhrase } = useWallet();
    const { utxos } = useUTXOs();
    const { isNFT } = useCharms();

    // NFT detection
    const isNftCharm = isNFT(charm);
    
    // Ensure NFTs always transfer the full amount
    useEffect(() => {
        if (isNftCharm) {
            setTransferAmount(charm.amount || 0);
        }
    }, [isNftCharm, charm.amount]);

    // Form validation logic
    // NFTs only require destination address as they transfer as whole units
    const isFormValid = !!destinationAddress?.trim() && (isNftCharm || transferAmount > 0);
    

    // Log message handler
    const addLogMessage = (message) => {
        setLogMessages(prev => [...prev, message]);
    };

    // Next step navigation
    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    };

    // Previous step navigation
    const handlePrevious = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    // Dialog close handler
    const handleClose = () => {
        // Reset dialog state
        setCurrentStep(0);
        setTransferAmount(charm.amount || 0);
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

    // Dialog step definitions
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
                    commitTxHex={commitTxHex}
                    spellTxHex={spellTxHex}
                    onBroadcastSuccess={() => setBroadcastComplete(true)}
                />
            )
        }
    ];

    // Hide dialog when not active
    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="card w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Dialog header */}
                <div className="bg-primary-600 text-white px-6 py-4 flex justify-between items-center">
                    <h3 className="text-lg font-bold">
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

                {/* Dialog content */}
                <div className="p-6 overflow-y-auto flex-grow">
                    {steps[currentStep].component}
                </div>

                {/* Navigation footer */}
                <div className="bg-dark-800 px-6 py-4 flex justify-between">
                    <button
                        onClick={handlePrevious}
                        disabled={currentStep === 0}
                        className={`btn ${currentStep === 0
                            ? 'bg-dark-700 opacity-50 cursor-not-allowed'
                            : 'btn-secondary'
                            }`}
                    >
                        Previous
                    </button>

                    <div className="flex space-x-2">
                        <button
                            onClick={handleClose}
                            className="btn btn-secondary"
                        >
                            Cancel
                        </button>

                        <button
                            onClick={currentStep === steps.length - 1 ? handleClose : handleNext}
                            disabled={(currentStep === steps.length - 1 && !broadcastComplete) ||
                                (currentStep === 0 && !isFormValid) ||
                                (currentStep === 2 && !commitTxHex) ||
                                (currentStep === 3 && !signedCommitTx)}
                            className={`btn ${(currentStep === steps.length - 1 && !broadcastComplete) ||
                                (currentStep === 0 && !isFormValid) ||
                                (currentStep === 2 && !commitTxHex) ||
                                (currentStep === 3 && !signedCommitTx)
                                ? 'bg-primary-400 opacity-50 cursor-not-allowed'
                                : 'btn-primary'
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
