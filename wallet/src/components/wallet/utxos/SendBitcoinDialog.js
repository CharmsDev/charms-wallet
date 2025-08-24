'use client';

import { useSendForm } from './send-dialog/hooks/useSendForm';
import { useTransactionFlow } from './send-dialog/hooks/useTransactionFlow';
import { SendForm } from './send-dialog/components/SendForm';
import { ConfirmationDialog } from './send-dialog/components/ConfirmationDialog';
import { SuccessDialog } from './send-dialog/components/SuccessDialog';
import { PreparingDialog } from './send-dialog/components/PreparingDialog';

export default function SendBitcoinDialog({ isOpen, onClose, confirmedUtxos, onSend, formatValue }) {
    // Form state and logic
    const formState = useSendForm();
    
    // Transaction flow state and logic
    const transactionFlow = useTransactionFlow(formState, onClose);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
            <div className="bg-dark-900 rounded-lg p-6 w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto border border-white/20">
                {transactionFlow.showPreparing && (
                    <PreparingDialog status={transactionFlow.preparingStatus} />
                )}

                {transactionFlow.showConfirmation && (
                    <ConfirmationDialog
                        transactionData={transactionFlow.transactionData}
                        error={formState.error}
                        onConfirm={transactionFlow.handleConfirmSend}
                        onCancel={transactionFlow.resetFlow}
                    />
                )}

                {transactionFlow.showSuccess && (
                    <SuccessDialog
                        txId={transactionFlow.txId}
                        destinationAddress={formState.destinationAddress}
                        amount={formState.amount}
                        transactionData={transactionFlow.transactionData}
                        feeRate={formState.feeRate}
                        onClose={() => {
                            transactionFlow.resetFlow();
                            onClose(); // Close the entire SendBitcoinDialog
                        }}
                    />
                )}

                {!transactionFlow.showPreparing && !transactionFlow.showConfirmation && !transactionFlow.showSuccess && (
                    <SendForm
                        formState={formState}
                        transactionFlow={transactionFlow}
                        onClose={onClose}
                    />
                )}
            </div>
        </div>
    );
}
