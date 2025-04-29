'use client';

import { useState } from 'react';

export default function AddressControls({ onGenerateAddress, error }) {
    return (
        <div className="p-6 flex justify-between items-center">
            <h2 className="text-xl font-bold gradient-text">Your Addresses</h2>
            <button
                onClick={onGenerateAddress}
                className="btn btn-primary"
            >
                Generate New Address
            </button>
        </div>
    );
}
