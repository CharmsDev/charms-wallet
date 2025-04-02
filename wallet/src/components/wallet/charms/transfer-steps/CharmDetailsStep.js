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
            console.error("Error composing spell template:", error);
        }
    }, [destinationAddress, transferAmount, charm, setSpellTemplate, setFinalSpell]);

    return (
        <div className="space-y-6">
            {/* Charm Information */}
            <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Charm Details</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <p className="text-gray-500">Type:</p>
                        <p className="font-medium">{isNftCharm ? 'NFT' : 'Token'}</p>
                    </div>
                    <div>
                        <p className="text-gray-500">ID:</p>
                        <p className="font-medium font-mono">{charm.id}</p>
                    </div>
                    <div>
                        <p className="text-gray-500">Available Amount:</p>
                        <p className="font-medium">{charm.amount.remaining} {charm.amount.ticker}</p>
                    </div>
                    <div>
                        <p className="text-gray-500">TXID:</p>
                        <p className="font-medium font-mono truncate">{charm.txid}</p>
                    </div>
                </div>
            </div>

            {/* Transfer Form */}
            <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Transfer Details</h4>

                <div>
                    <label htmlFor="destination-address" className="block text-sm font-medium text-gray-700 mb-1">
                        Destination Address
                    </label>
                    <input
                        type="text"
                        id="destination-address"
                        value={destinationAddress}
                        onChange={handleAddressChange}
                        placeholder="Enter Bitcoin address (tb1...)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                        Enter a valid Bitcoin testnet address (tb1...)
                    </p>
                </div>

                <div>
                    <label htmlFor="transfer-amount" className="block text-sm font-medium text-gray-700 mb-1">
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
                            className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${isNftCharm ? 'bg-gray-100' : ''
                                }`}
                        />
                        <span className="ml-2 text-gray-500">{charm.amount.ticker}</span>
                    </div>
                    {isNftCharm && (
                        <p className="mt-1 text-xs text-gray-500">
                            NFTs must be transferred in their entirety.
                        </p>
                    )}
                </div>
            </div>

            {/* Form validation message */}
            {!isFormValid && (
                <div className="text-sm text-red-500">
                    Please enter a valid destination address and amount to continue.
                </div>
            )}
        </div>
    );
}
