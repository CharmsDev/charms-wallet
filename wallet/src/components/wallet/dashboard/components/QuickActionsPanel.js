'use client';

import { useBlockchain } from '@/stores/blockchainStore';

export default function QuickActionsPanel({ onSend, onReceive }) {
    const { isCardano } = useBlockchain();
    const asset = isCardano() ? 'ADA' : 'BTC';
    const chain = isCardano() ? 'Cardano' : 'Bitcoin';

    const actions = [
        {
            id: 'send',
            label: `Send ${asset}`,
            icon: '↗',
            onClick: onSend,
            description: `Send ${chain}`
        },
        {
            id: 'receive',
            label: `Receive ${asset}`,
            icon: '↙',
            onClick: onReceive,
            description: `Receive ${chain}`
        }
    ];

    return (
        <div className="flex items-center gap-3">
            {actions.map((action) => (
                <button
                    key={action.id}
                    onClick={action.onClick}
                    className="
                        flex items-center gap-2 px-5 py-2.5 rounded-lg
                        bg-gradient-to-b from-gray-800 to-gray-900
                        border border-gray-600/60
                        text-sm font-semibold text-white
                        shadow-lg shadow-black/20
                        hover:from-gray-700 hover:to-gray-800 hover:border-gray-500 hover:shadow-xl
                        active:scale-95
                        transition-all duration-200
                    "
                    title={action.description}
                >
                    <span className="text-lg">{action.icon}</span>
                    <span>{action.label}</span>
                </button>
            ))}
        </div>
    );
}
