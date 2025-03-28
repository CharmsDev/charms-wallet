'use client';

import { useState, useEffect } from 'react';
import { useUTXOs } from '@/stores/utxoStore';

export default function SpellJsonStep({
    spellTemplate,
    finalSpell,
    setFinalSpell,
    logMessages
}) {
    const [editedSpell, setEditedSpell] = useState(finalSpell);
    const [isEditing, setIsEditing] = useState(false);
    const [highestUtxo, setHighestUtxo] = useState(null);
    const { utxos } = useUTXOs();

    // Find highest amount UTXO
    useEffect(() => {
        let maxUtxo = null;
        let maxValue = 0;

        // Iterate through all UTXOs to find the one with the highest value
        Object.entries(utxos).forEach(([address, addressUtxos]) => {
            addressUtxos.forEach(utxo => {
                if (utxo.value > maxValue) {
                    maxValue = utxo.value;
                    maxUtxo = {
                        txid: utxo.txid,
                        vout: utxo.vout,
                        value: utxo.value,
                        address
                    };
                }
            });
        });

        setHighestUtxo(maxUtxo);
    }, [utxos]);

    // Handle spell JSON edit
    const handleSpellChange = (e) => {
        setEditedSpell(e.target.value);
    };

    // Toggle edit mode
    const toggleEditMode = () => {
        if (isEditing) {
            // Save changes
            try {
                // Validate JSON
                JSON.parse(editedSpell);
                setFinalSpell(editedSpell);
                setIsEditing(false);
            } catch (error) {
                alert(`Invalid JSON: ${error.message}`);
            }
        } else {
            // Enter edit mode
            setIsEditing(true);
        }
    };

    // Cancel editing
    const cancelEditing = () => {
        setEditedSpell(finalSpell);
        setIsEditing(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h4 className="font-medium text-gray-900">Spell JSON</h4>
                <div className="space-x-2">
                    {isEditing && (
                        <button
                            onClick={cancelEditing}
                            className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                        >
                            Cancel
                        </button>
                    )}
                    <button
                        onClick={toggleEditMode}
                        className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                        {isEditing ? 'Save' : 'Edit'}
                    </button>
                </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500 mb-2">
                    This is the spell that will be used to transfer your charm. You can edit it if needed.
                </p>
                {isEditing ? (
                    <textarea
                        value={editedSpell}
                        onChange={handleSpellChange}
                        className="w-full h-64 font-mono text-sm p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                ) : (
                    <pre className="bg-gray-800 text-green-400 p-4 rounded-md overflow-x-auto text-sm font-mono h-64 overflow-y-auto">
                        {finalSpell || 'No spell generated yet.'}
                    </pre>
                )}

                {/* Funding UTXO Information */}
                <div className="mt-4 p-3 bg-blue-50 rounded-md border border-blue-100">
                    <h5 className="text-sm font-medium text-blue-800 mb-1">Funding UTXO Information</h5>
                    {highestUtxo ? (
                        <div className="text-xs font-mono">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-blue-700">UTXO ID:</span>
                                <span className="text-blue-900">{highestUtxo.txid}:{highestUtxo.vout}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-blue-700">Amount:</span>
                                <span className="text-blue-900 font-semibold">{highestUtxo.value} sats</span>
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-blue-700">
                            Loading UTXO information...
                        </p>
                    )}
                </div>
            </div>

            {/* Log messages */}
            {logMessages.length > 0 && (
                <div className="mt-4">
                    <h5 className="font-medium text-gray-900 mb-2">Log Messages</h5>
                    <div className="bg-gray-100 p-3 rounded-md max-h-32 overflow-y-auto">
                        {logMessages.map((message, index) => (
                            <div key={index} className="text-sm text-gray-700 mb-1">
                                {message}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h5 className="font-medium text-blue-800 mb-2">Information</h5>
                <p className="text-sm text-blue-700">
                    The spell JSON defines how your charm will be transferred. Advanced users can modify this JSON to customize the transfer behavior.
                </p>
            </div>
        </div>
    );
}
