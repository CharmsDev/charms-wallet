'use client';

import React from 'react';

export default function SpellJsonStep({
    finalSpell,
    logMessages
}) {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h4 className="font-medium text-gray-900">Spell JSON</h4>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500 mb-2">
                    This is the spell that will be used to transfer your charm.
                </p>
                <pre className="bg-gray-800 text-green-400 p-4 rounded-md overflow-x-auto text-sm font-mono h-64 overflow-y-auto">
                    {finalSpell || 'No spell generated yet.'}
                </pre>
            </div>

            {/* Log messages section */}
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
                    The spell JSON defines how your charm will be transferred.
                </p>
            </div>
        </div>
    );
}
