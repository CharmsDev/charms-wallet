'use client';

import { useState } from 'react';

export default function AddressControls({ onGenerateAddress, error }) {
    return (
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">Your Addresses</h3>
            <button
                onClick={onGenerateAddress}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-md"
            >
                Generate New Address
            </button>
        </div>
    );
}
