'use client';

import Modal from '@/components/common/Modal';

const WalletExistsModal = ({ isOpen, onClose }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Wallet Already Exists">
            <div className="space-y-4">
                <p>
                    You are trying to import a new wallet, but a wallet is already active.
                    For security reasons, you cannot overwrite an existing wallet directly.
                </p>
                <p className="font-semibold text-yellow-400">
                    To proceed, you must first securely back up your current seed phrase, then delete the current wallet.
                </p>
                <p>
                    Once the current wallet is deleted, you can click the import link again.
                </p>
            </div>
            <div className="mt-6 flex justify-end">
                <button
                    onClick={onClose}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200"
                >
                    Close
                </button>
            </div>
        </Modal>
    );
};

export default WalletExistsModal;
