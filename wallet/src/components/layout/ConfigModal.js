'use client';

import React from 'react';
import config from '@/config';
import packageJson from '../../../package.json';

export default function ConfigModal({ isOpen, onClose }) {
    if (!isOpen) return null;

    const network = config.bitcoin.network || '—';
    const isTestnet = config.bitcoin.isTestnet();

    // Prover URLs
    let proverUrl = '—';
    try { proverUrl = config.api.getProverUrl(network); } catch { /* not configured */ }
    const isLocalProver = proverUrl?.includes('localhost') || proverUrl?.includes('127.0.0.1');
    const zkpIsReal = !isLocalProver && proverUrl !== '—';

    // API URLs
    const charmsApiUrl = config.api.charms || '—';
    const walletApiUrl = config.api.wallet || '—';
    const explorerWalletApiUrl = config.explorerWallet?.apiUrl || '—';

    // QuickNode
    const quickNodeUrl = config.bitcoin.getQuickNodeApiUrl(network);
    const hasQuickNode = config.bitcoin.hasQuickNode(network);

    // Mempool
    const mempoolMainnet = 'https://mempool.space/api';
    const mempoolTestnet4 = 'https://mempool.space/testnet4/api';
    const mempoolUrl = isTestnet ? mempoolTestnet4 : mempoolMainnet;

    // Cardano
    const cardanoNetwork = config.cardano?.network || '—';
    const blockfrostUrl = config.cardano?.getBlockfrostApiUrl?.() || '—';
    const hasBlockfrost = !!(config.cardano?.blockfrostProjectId);

    const truncate = (str, len = 22) => {
        if (!str || str === '—') return '—';
        if (str.length <= len * 2) return str;
        return `${str.slice(0, len)}...${str.slice(-len)}`;
    };

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
            onClick={onClose}
        >
            <div
                className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-[720px] max-h-[90vh] overflow-y-auto shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-dark-700">
                    <h2 className="text-lg font-bold text-dark-100">Wallet Configuration</h2>
                    <button
                        onClick={onClose}
                        className="text-dark-400 hover:text-dark-100 hover:bg-dark-700 rounded-lg p-1 transition-colors"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {/* Left column */}
                        <div className="space-y-5">
                            {/* General */}
                            <Section title="General">
                                <Row
                                    icon={<TagIcon />}
                                    label="Wallet Version"
                                    value={`v${packageJson.version}`}
                                    highlight
                                />
                                <Row
                                    icon={<NetworkIcon />}
                                    label="Bitcoin Network"
                                    value={network.toUpperCase()}
                                    className={isTestnet ? 'text-yellow-400' : 'text-emerald-400'}
                                />
                                {cardanoNetwork !== '—' && (
                                    <Row
                                        icon={<NetworkIcon />}
                                        label="Cardano Network"
                                        value={cardanoNetwork.toUpperCase()}
                                        className="text-blue-400"
                                    />
                                )}
                            </Section>

                            {/* ZK Prover */}
                            <Section title="ZK Prover">
                                <Row
                                    icon={<ServerIcon />}
                                    label="Prover URL"
                                    value={truncate(proverUrl)}
                                    mono
                                />
                                <Row
                                    icon={<ShieldIcon />}
                                    label="Proof Mode"
                                    custom={
                                        <div className="flex gap-3 mt-0.5">
                                            <span className={`flex items-center gap-1.5 text-xs ${zkpIsReal ? 'text-dark-100' : 'text-dark-500'}`}>
                                                <span className={`inline-block w-3 h-3 rounded-full border-2 ${zkpIsReal ? 'border-emerald-400' : 'border-dark-500'} relative`}>
                                                    {zkpIsReal && <span className="absolute top-0.5 left-0.5 w-1 h-1 rounded-full bg-emerald-400" />}
                                                </span>
                                                Real
                                            </span>
                                            <span className={`flex items-center gap-1.5 text-xs ${!zkpIsReal ? 'text-dark-100' : 'text-dark-500'}`}>
                                                <span className={`inline-block w-3 h-3 rounded-full border-2 ${!zkpIsReal ? 'border-emerald-400' : 'border-dark-500'} relative`}>
                                                    {!zkpIsReal && <span className="absolute top-0.5 left-0.5 w-1 h-1 rounded-full bg-emerald-400" />}
                                                </span>
                                                Mocked
                                            </span>
                                        </div>
                                    }
                                />
                            </Section>

                            {/* Bitcoin APIs */}
                            <Section title="Bitcoin APIs">
                                <Row
                                    icon={<GlobeIcon />}
                                    label="Mempool.space"
                                    value={truncate(mempoolUrl)}
                                    mono
                                />
                                <Row
                                    icon={<DatabaseIcon />}
                                    label="QuickNode"
                                    value={hasQuickNode ? truncate(quickNodeUrl) : 'Not configured'}
                                    mono
                                    className={!hasQuickNode ? 'text-dark-500 italic' : undefined}
                                />
                            </Section>
                        </div>

                        {/* Right column */}
                        <div className="space-y-5">
                            {/* Charms APIs */}
                            <Section title="Charms APIs">
                                <Row
                                    icon={<DatabaseIcon />}
                                    label="Explorer Wallet API"
                                    value={truncate(explorerWalletApiUrl)}
                                    mono
                                />
                                <Row
                                    icon={<ServerIcon />}
                                    label="Charms API"
                                    value={truncate(charmsApiUrl)}
                                    mono
                                />
                                <Row
                                    icon={<GlobeIcon />}
                                    label="Wallet API"
                                    value={truncate(walletApiUrl)}
                                    mono
                                    className={walletApiUrl === '—' ? 'text-dark-500 italic' : undefined}
                                />
                            </Section>

                            {/* Cardano APIs (if configured) */}
                            {cardanoNetwork !== '—' && (
                                <Section title="Cardano APIs">
                                    <Row
                                        icon={<DatabaseIcon />}
                                        label="Blockfrost"
                                        value={hasBlockfrost ? truncate(blockfrostUrl) : 'Not configured'}
                                        mono
                                        className={!hasBlockfrost ? 'text-dark-500 italic' : undefined}
                                    />
                                    <Row
                                        icon={<GlobeIcon />}
                                        label="Cardano API"
                                        value={truncate(config.api.cardano || '—')}
                                        mono
                                    />
                                </Section>
                            )}

                            {/* Prover Endpoints */}
                            <Section title="Prover Endpoints">
                                <Row
                                    icon={<ServerIcon />}
                                    label="Mainnet Prover"
                                    value={truncate(config.api.prover?.mainnet || '—')}
                                    mono
                                    className={!config.api.prover?.mainnet ? 'text-dark-500 italic' : undefined}
                                />
                                <Row
                                    icon={<ServerIcon />}
                                    label="Testnet4 Prover"
                                    value={truncate(config.api.prover?.testnet4 || '—')}
                                    mono
                                    className={!config.api.prover?.testnet4 ? 'text-dark-500 italic' : undefined}
                                />
                            </Section>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Sub-components ──────────────────────────────────────────────────

function Section({ title, children }) {
    return (
        <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-dark-400 mb-2 pb-1.5 border-b border-dark-700/60">
                {title}
            </h3>
            <div className="space-y-1">{children}</div>
        </div>
    );
}

function Row({ icon, label, value, mono, highlight, className, custom }) {
    return (
        <div className="flex items-start gap-3 py-1.5">
            {icon && <span className="text-bitcoin-400 mt-0.5 flex-shrink-0">{icon}</span>}
            <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs text-dark-400">{label}</span>
                {custom || (
                    <span
                        className={`text-sm font-medium break-all ${
                            highlight ? 'text-purple-400 font-semibold' :
                            mono ? 'font-mono text-xs text-dark-200' :
                            className || 'text-dark-100'
                        }`}
                    >
                        {value}
                    </span>
                )}
            </div>
        </div>
    );
}

// ── Icons (inline SVGs to avoid external dependencies) ──────────────

function TagIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
        </svg>
    );
}

function NetworkIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
    );
}

function ServerIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
        </svg>
    );
}

function ShieldIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
    );
}

function GlobeIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
    );
}

function DatabaseIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
    );
}
