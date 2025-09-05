'use client';

export default function QuickActionsPanel({ onSend, onReceive, onViewHistory, onSettings }) {
    const actions = [
        {
            id: 'send',
            label: 'Send',
            icon: '↗',
            onClick: onSend,
            className: 'btn-disabled',
            description: 'Send Bitcoin (temporarily disabled)',
            enabled: false
        },
        {
            id: 'receive',
            label: 'Receive',
            icon: '↙',
            onClick: onReceive,
            className: 'btn-primary',
            description: 'Generate address',
            enabled: true
        },
        {
            id: 'history',
            label: 'History',
            icon: '📋',
            onClick: onViewHistory,
            className: 'btn-disabled',
            description: 'Coming soon',
            enabled: false
        },
        {
            id: 'settings',
            label: 'Settings',
            icon: '⚙️',
            onClick: onSettings,
            className: 'btn-primary',
            description: 'Wallet settings',
            enabled: true
        }
    ];

    return (
        <div className="card p-6">
            <h3 className="text-lg font-semibold gradient-text mb-4">Quick Actions</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {actions.map((action) => (
                    <button
                        key={action.id}
                        onClick={action.enabled ? action.onClick : undefined}
                        disabled={!action.enabled}
                        className={`${action.className} flex flex-col items-center justify-center p-4 h-24 space-y-2 ${
                            action.enabled 
                                ? 'hover:scale-105 transition-transform cursor-pointer' 
                                : 'cursor-not-allowed opacity-50'
                        }`}
                        title={action.description}
                    >
                        <span className="text-2xl">{action.icon}</span>
                        <span className="text-sm font-medium">{action.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
