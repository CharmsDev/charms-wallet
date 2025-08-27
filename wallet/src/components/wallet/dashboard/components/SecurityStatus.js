'use client';

import { useState } from 'react';

export default function SecurityStatus({ hasWallet, seedPhrase }) {
    const [lastLogin] = useState(new Date()); // Mock last login time

    const securityItems = [
        {
            id: 'backup',
            label: 'Wallet Backup',
            status: hasWallet && seedPhrase ? 'completed' : 'pending',
            icon: '🔒',
            description: 'Seed phrase secured'
        },
        {
            id: 'encryption',
            label: 'Local Encryption',
            status: 'completed',
            icon: '🛡️',
            description: 'Data encrypted'
        },
        {
            id: 'network',
            label: 'Network Security',
            status: 'completed',
            icon: '🌐',
            description: 'Secure connection'
        }
    ];

    const getStatusColor = (status) => {
        switch (status) {
            case 'completed': return 'text-green-400';
            case 'warning': return 'text-yellow-400';
            case 'pending': return 'text-red-400';
            default: return 'text-dark-400';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'completed': return '✓';
            case 'warning': return '⚠';
            case 'pending': return '○';
            default: return '•';
        }
    };

    const formatLastLogin = (date) => {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="card p-6">
            <h3 className="text-lg font-semibold gradient-text mb-4">Security Status</h3>
            
            {/* Security Items */}
            <div className="space-y-3 mb-6">
                {securityItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 glass-effect rounded-lg">
                        <div className="flex items-center space-x-3">
                            <span className="text-lg">{item.icon}</span>
                            <div>
                                <p className="text-sm font-medium text-white">{item.label}</p>
                                <p className="text-xs text-dark-400">{item.description}</p>
                            </div>
                        </div>
                        <span className={`text-lg ${getStatusColor(item.status)}`}>
                            {getStatusIcon(item.status)}
                        </span>
                    </div>
                ))}
            </div>

            {/* Last Login */}
            <div className="flex justify-between items-center text-sm text-dark-400 mb-4">
                <span>Last login:</span>
                <span>{formatLastLogin(lastLogin)}</span>
            </div>

            {/* Security Recommendations */}
            <div className="mt-6 pt-4 border-t border-dark-700">
                <h4 className="text-sm font-medium text-dark-300 mb-3">Recommendations</h4>
                <div className="space-y-2 text-xs text-dark-400">
                    <div className="flex items-center space-x-2">
                        <span className="text-green-400">✓</span>
                        <span>Write down your seed phrase</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <span className="text-green-400">✓</span>
                        <span>Store backup in secure location</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <span className="text-yellow-400">•</span>
                        <span>Consider hardware wallet for large amounts</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
