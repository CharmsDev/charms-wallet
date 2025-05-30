'use client';

import { useState } from 'react';

export default function AddressControls({ onGenerateAddress, error, isCardano, addressType, onToggleAddressType }) {
    return (
        <div className="p-6 flex justify-between items-center">
            <h2 className="text-xl font-bold gradient-text">Your Addresses</h2>
            <div className="flex items-center space-x-3">
                {isCardano && (
                    <div className="flex items-center">
                        <span className="text-sm text-dark-300 mr-2">Address Type:</span>
                        <button
                            onClick={onToggleAddressType}
                            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${addressType === 'payment'
                                    ? "bg-cardano-500/20 text-cardano-400 cardano-glow-text"
                                    : "bg-dark-700/30 text-dark-400 hover:bg-dark-700/50"
                                }`}
                        >
                            Payment
                        </button>
                        <button
                            onClick={onToggleAddressType}
                            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ml-2 ${addressType === 'staking'
                                    ? "bg-cardano-500/20 text-cardano-400 cardano-glow-text"
                                    : "bg-dark-700/30 text-dark-400 hover:bg-dark-700/50"
                                }`}
                        >
                            Staking
                        </button>
                    </div>
                )}
                <button
                    onClick={onGenerateAddress}
                    className={`btn ${isCardano ? 'btn-cardano' : 'btn-primary'}`}
                >
                    Generate New Address
                </button>
            </div>
        </div>
    );
}
