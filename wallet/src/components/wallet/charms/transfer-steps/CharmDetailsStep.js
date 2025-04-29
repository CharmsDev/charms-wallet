'use client';

import { useState, useEffect } from 'react';
import { charmsSpellService } from '@/services/charms/spell-composer';

export default function CharmDetailsStep({
    charm,
    transferAmount,
    setTransferAmount,
    destinationAddress,
    setDestinationAddress,
    isNftCharm,
    isFormValid,
    setSpellTemplate,
    setFinalSpell
}) {
    // Handle address input
    const handleAddressChange = (e) => {
        setDestinationAddress(e.target.value);
    };

    // Handle amount input
    const handleAmountChange = (e) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value) && value > 0 && value <= charm.amount.remaining) {
            setTransferAmount(value);
        }
    };

    // Set NFT transfer amount to 1
    useEffect(() => {
        if (isNftCharm) {
            setTransferAmount(1);
        }
    }, [isNftCharm, setTransferAmount]);

    // Update spell template on input change
    useEffect(() => {
        try {
            if (destinationAddress?.trim()) {
                // Use the charmsSpellService to compose the spell
                const spellTemplate = charmsSpellService.composeTransferSpell(
                    charm,
                    transferAmount,
                    destinationAddress
                );

                setSpellTemplate(spellTemplate);
                setFinalSpell(spellTemplate);
            } else {
                setSpellTemplate("");
                setFinalSpell("");
            }
        } catch (error) {
            // Error composing spell template
        }
    }, [destinationAddress, transferAmount, charm, setSpellTemplate, setFinalSpell]);

    return (
        <div className="space-y-6">
            {/* Charm Information */}
            <div className="glass-effect p-4 rounded-xl">
                <h4 className="font-bold text-white mb-2">Charm Details</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <p className="text-dark-400">Type:</p>
                        <p className="font-medium text-white">
                            {isNftCharm ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-900/30 text-primary-400">
                                    NFT
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-bitcoin-900/30 text-bitcoin-400">
                                    Token
                                </span>
                            )}
                        </p>
                    </div>
                    <div>
                        <p className="text-dark-400">ID:</p>
                        <p className="font-medium font-mono text-white">{charm.id}</p>
                    </div>
                    <div>
                        <p className="text-dark-400">Available Amount:</p>
                        <p className="font-medium text-bitcoin-400">{charm.amount.remaining} {charm.amount.ticker}</p>
                    </div>
                    <div>
                        <p className="text-dark-400">TXID:</p>
                        <p className="font-medium font-mono truncate text-white">{charm.txid}</p>
                    </div>
                </div>
            </div>

            {/* Transfer Form */}
            <div className="space-y-4">
                <h4 className="font-bold gradient-text">Transfer Details</h4>

                <div>
                    <label htmlFor="destination-address" className="block text-sm font-medium text-dark-200 mb-1">
                        Destination Address
                    </label>
                    <input
                        type="text"
                        id="destination-address"
                        value={destinationAddress}
                        onChange={handleAddressChange}
                        placeholder="Enter Bitcoin address (tb1...)"
                        className="w-full px-3 py-2 bg-dark-700 border border-dark-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <p className="mt-1 text-xs text-dark-400">
                        Enter a valid Bitcoin testnet address (tb1...)
                    </p>
                </div>

                <div>
                    <label htmlFor="transfer-amount" className="block text-sm font-medium text-dark-200 mb-1">
                        Amount to Transfer
                    </label>
                    <div className="flex items-center">
                        <input
                            type="number"
                            id="transfer-amount"
                            value={isNftCharm ? 1 : transferAmount}
                            onChange={handleAmountChange}
                            disabled={isNftCharm}
                            min="0.00000001"
                            max={charm.amount.remaining}
                            step="0.00000001"
                            className={`w-full px-3 py-2 bg-dark-700 border border-dark-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${isNftCharm ? 'opacity-50' : ''
                                }`}
                        />
                        <span className="ml-2 text-bitcoin-400">{charm.amount.ticker}</span>
                    </div>
                    {isNftCharm && (
                        <p className="mt-1 text-xs text-dark-400">
                            NFTs must be transferred in their entirety.
                        </p>
                    )}
                </div>
            </div>

            {/* Form validation message */}
            {!isFormValid && (
                <div className="text-sm text-red-400">
                    Please enter a valid destination address and amount to continue.
                </div>
            )}
        </div>
    );
}
