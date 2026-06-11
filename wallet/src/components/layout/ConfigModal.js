'use client';

import React, { useState, useEffect } from 'react';
import config from '@/config';
import packageJson from '../../../package.json';
import { SPELL_VERSION, EXPLORER_API, PROVER_URL_MAINNET, PROVER_URL_TESTNET } from '@/services/charm-transfer/constants';
import { getWalletType } from '@/services/auth';

// What data the wallet reads/writes and which external endpoint serves
// each request. Kept shallow on purpose — we don't expose what providers
// the Explorer/Blockfrost use downstream, because that changes and would
// leave the modal lying when it does.
const DATA_SOURCES = [
    // Bitcoin — wallet talks to Explorer API; mempool.space is the only
    // failover the wallet itself dials directly.
    { data: 'BTC UTXOs',         source: 'Explorer API',         badge: 'explorer', endpoint: '/v1/wallet/utxos/<addr>' },
    { data: 'BTC Balance',       source: 'Explorer API',         badge: 'explorer', endpoint: '/v1/wallet/balance/batch' },
    { data: 'BTC Charms',        source: 'Explorer API',         badge: 'explorer', endpoint: '/v1/wallet/charms/<addr>' },
    { data: 'BTC Transactions',  source: 'Explorer API',         badge: 'explorer', endpoint: '/v1/wallet/transactions/batch' },
    { data: 'BTC Fee Estimates', source: 'mempool.space',        badge: 'external', endpoint: '/v1/fees/recommended' },
    { data: 'BTC Broadcast TX',  source: 'Explorer → mempool.space (failover)', badge: 'multi',    endpoint: '/v1/wallet/broadcast' },
    { data: 'BTC TX Lookup',     source: 'Explorer → mempool.space (failover)', badge: 'multi',    endpoint: '/v1/transactions/<txid>' },
    { data: 'Charm Metadata',    source: 'Explorer API',         badge: 'explorer', endpoint: '/v1/assets/reference-nft/<identityHash>' },
    { data: 'Spell Proving',     source: 'Charms Prover',        badge: 'prover',   endpoint: '/spells/prove (POST)' },
    { data: 'BTC Price',         source: 'CoinGecko',            badge: 'external', endpoint: '/api/v3/simple/price' },
    // Cardano — Blockfrost primary, Koios fallback (the wallet calls Koios
    // directly via its public proxy when Blockfrost fails).
    { data: 'ADA UTXOs',         source: 'Blockfrost → Koios (failover)', badge: 'multi',   endpoint: '/addresses/<addr>/utxos' },
    { data: 'ADA Balance',       source: 'Blockfrost → Koios (failover)', badge: 'multi',   endpoint: '/addresses/<addr>' },
    { data: 'ADA Assets',        source: 'Blockfrost',          badge: 'cardano',  endpoint: '/assets/<unit>' },
    { data: 'ADA Transactions',  source: 'Blockfrost → Koios (failover)', badge: 'multi',   endpoint: '/addresses/<addr>/transactions' },
    { data: 'ADA Submit TX',     source: 'Blockfrost',          badge: 'cardano',  endpoint: '/tx/submit (POST CBOR)' },
    { data: 'ADA Protocol',      source: 'Blockfrost → Koios (failover)', badge: 'multi',   endpoint: '/epochs/latest/parameters' },
    // Auth
    { data: 'WebAuthn Origins',  source: 'Wallet (self)',       badge: 'self',     endpoint: '/.well-known/webauthn' },
];

export default function ConfigModal({ isOpen, onClose }) {
    const [activeTab, setActiveTab] = useState('config');
    const [proverOverride, setProverOverride] = useState(() => {
        if (typeof window === 'undefined') return '';
        try { return localStorage.getItem('wallet:prover:override') || ''; } catch { return ''; }
    });
    const [walletType, setWalletType] = useState(null); // 'prf' | 'password' | null
    useEffect(() => {
        if (!isOpen) return;
        let alive = true;
        getWalletType().then(t => { if (alive) setWalletType(t); }).catch(() => {});
        return () => { alive = false; };
    }, [isOpen]);

    if (!isOpen) return null;

    const network = config.bitcoin.network || '—';
    const isTestnet = config.bitcoin.isTestnet();

    // Prover — runtime override takes precedence
    const effectiveProverUrl = proverOverride || (network === 'mainnet' ? PROVER_URL_MAINNET : PROVER_URL_TESTNET);
    const proverUrl = effectiveProverUrl;
    const isLocalProver = proverUrl?.includes('localhost') || proverUrl?.includes('127.0.0.1');
    const zkpIsReal = !isLocalProver && proverUrl !== '—';

    // Clean up any stale prover override from old versions
    if (typeof window !== 'undefined') {
        try { localStorage.removeItem('wallet:prover:override'); } catch {}
    }

    // APIs
    const explorerApiUrl = EXPLORER_API || '—';
    const walletApiUrl = config.api.wallet || '—';

    // Mempool
    const mempoolUrl = isTestnet ? 'https://mempool.space/testnet4/api' : 'https://mempool.space/api';

    // Environment variables (shows what was injected at build time)
    const envVars = {
        proverMainnet: process.env.NEXT_PUBLIC_PROVER_MAINNET_URL || '(fallback)',
        proverTestnet: process.env.NEXT_PUBLIC_PROVER_TESTNET4_URL || '(fallback)',
        explorerApi: process.env.NEXT_PUBLIC_EXPLORER_WALLET_API_URL || '(fallback)',
        btcNetwork: process.env.NEXT_PUBLIC_BITCOIN_NETWORK || '(fallback)',
        cardanoNetwork: process.env.NEXT_PUBLIC_CARDANO_NETWORK || '(fallback)',
    };

    const truncate = (str, len = 22) => {
        if (!str || str === '—') return '—';
        if (str.length <= len * 2) return str;
        return `${str.slice(0, len)}...${str.slice(-len)}`;
    };

    // Cardano config
    const cardanoNetwork = config.cardano.network || '—';
    const blockfrostUrl = config.cardano.getBlockfrostApiUrl() || '—';
    const blockfrostId = config.cardano.blockfrostProjectId;
    const hasBlockfrost = !!blockfrostId && blockfrostId !== '—';

    const badgeClasses = {
        explorer: 'bg-blue-500/15 text-blue-400',
        multi:    'bg-emerald-500/15 text-emerald-400',
        prover:   'bg-purple-500/15 text-purple-400',
        external: 'bg-yellow-500/15 text-yellow-400',
        cardano:  'bg-cardano-500/15 text-cardano-400',
        self:     'bg-pink-500/15 text-pink-400',
    };

    // Security — derived from the v3 auth blob shape.
    const securityLabel = walletType === 'prf'
        ? 'Passkey (WebAuthn PRF)'
        : walletType === 'password'
        ? 'Password (PBKDF2 + AES-GCM 256)'
        : walletType === null
        ? 'Loading…'
        : 'None (legacy plaintext)';
    const securityClass = walletType === 'prf' ? 'text-emerald-400'
        : walletType === 'password' ? 'text-blue-400'
        : 'text-red-400';
    const atRest = walletType === 'prf'
        ? 'Nothing at rest (seed derived on demand)'
        : walletType === 'password'
        ? 'Encrypted blob in local storage'
        : '—';

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
            onClick={onClose}
        >
            <div
                className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-[1100px] max-h-[90vh] overflow-y-auto shadow-2xl"
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

                {/* Tabs */}
                <div className="flex border-b border-dark-700 px-6">
                    <button
                        className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${activeTab === 'config' ? 'text-dark-100 border-bitcoin-400' : 'text-dark-400 border-transparent hover:text-dark-100'}`}
                        onClick={() => setActiveTab('config')}
                    >
                        Configuration
                    </button>
                    <button
                        className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${activeTab === 'data-sources' ? 'text-dark-100 border-bitcoin-400' : 'text-dark-400 border-transparent hover:text-dark-100'}`}
                        onClick={() => setActiveTab('data-sources')}
                    >
                        Data Sources
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {activeTab === 'config' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {/* Column 1 — identity */}
                            <div className="space-y-5">
                                <Section title="General">
                                    <Row icon={<TagIcon />} label="Wallet Version" value={`v${packageJson.version}`} highlight />
                                    <Row icon={<TagIcon />} label="Charms Version" value="v14.0.0" highlight />
                                    <Row icon={<ShieldIcon />} label="Spell Version" value={`${SPELL_VERSION}`} className="text-purple-400" />
                                    <Row
                                        icon={<NetworkIcon />}
                                        label="Network"
                                        value={network.toUpperCase()}
                                        className={isTestnet ? 'text-yellow-400' : 'text-emerald-400'}
                                    />
                                </Section>

                                <Section title="Security">
                                    <Row
                                        icon={<ShieldIcon />}
                                        label="Authentication"
                                        value={securityLabel}
                                        className={securityClass}
                                    />
                                    <Row
                                        icon={<DatabaseIcon />}
                                        label="Mnemonic at rest"
                                        value={atRest}
                                        className="text-dark-200"
                                    />
                                    <Row
                                        icon={<GlobeIcon />}
                                        label="WebAuthn RP id"
                                        value={typeof window !== 'undefined' ? 'wallet.charms.dev' : '—'}
                                        mono
                                    />
                                </Section>
                            </div>

                            {/* Column 2 — compute */}
                            <div className="space-y-5">
                                <Section title="ZK Prover">
                                    <Row icon={<ServerIcon />} label="Prover URL" value={truncate(proverUrl)} mono />
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

                                <Section title="Bitcoin Data">
                                    <Row icon={<DatabaseIcon />} label="Explorer API (primary)" value={truncate(explorerApiUrl)} mono />
                                    <Row icon={<GlobeIcon />} label="mempool.space (failover)" value={truncate(mempoolUrl)} mono />
                                </Section>

                                <Section title="Build Environment">
                                    <Row icon={<ServerIcon />} label="Prover (env)" value={truncate(envVars.proverMainnet, 28)} mono />
                                    <Row icon={<DatabaseIcon />} label="Explorer (env)" value={truncate(envVars.explorerApi, 28)} mono />
                                    <Row icon={<NetworkIcon />} label="BTC Network (env)" value={envVars.btcNetwork} />
                                    <Row icon={<NetworkIcon />} label="ADA Network (env)" value={envVars.cardanoNetwork} />
                                </Section>
                            </div>

                            {/* Column 3 — external services */}
                            <div className="space-y-5">
                                <Section title="APIs">
                                    <Row
                                        icon={<GlobeIcon />}
                                        label="Wallet API"
                                        value={truncate(walletApiUrl)}
                                        mono
                                        className={walletApiUrl === '—' ? 'text-dark-500 italic' : undefined}
                                    />
                                    <Row icon={<GlobeIcon />} label="CoinGecko (BTC price)" value="https://api.coingecko.com" mono />
                                </Section>

                                <Section title="Cardano">
                                    <Row
                                        icon={<NetworkIcon />}
                                        label="Network"
                                        value={cardanoNetwork.toUpperCase()}
                                        className={cardanoNetwork === 'mainnet' ? 'text-emerald-400' : 'text-yellow-400'}
                                    />
                                    <Row icon={<DatabaseIcon />} label="Blockfrost API" value={truncate(blockfrostUrl)} mono />
                                    <Row
                                        icon={<ShieldIcon />}
                                        label="Blockfrost Project"
                                        value={hasBlockfrost ? `${blockfrostId.slice(0, 8)}...` : 'Not configured'}
                                        className={hasBlockfrost ? 'text-emerald-400' : 'text-red-400'}
                                    />
                                </Section>

                                <Section title="Provider Architecture">
                                    <div className="space-y-2 text-xs text-dark-300">
                                        <div className="flex items-center gap-2">
                                            <span className="inline-block w-2 h-2 rounded-full bg-blue-400" />
                                            <span><strong className="text-dark-100">Bitcoin:</strong> Explorer API → mempool.space</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="inline-block w-2 h-2 rounded-full bg-cardano-400" />
                                            <span><strong className="text-dark-100">Cardano:</strong> Blockfrost → Koios</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="inline-block w-2 h-2 rounded-full bg-purple-400" />
                                            <span><strong className="text-dark-100">Beaming:</strong> Charms Prover (proofs + Cardano signing)</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="inline-block w-2 h-2 rounded-full bg-pink-400" />
                                            <span><strong className="text-dark-100">Auth:</strong> Local-only, RP id <code className="text-pink-300">wallet.charms.dev</code></span>
                                        </div>
                                    </div>
                                </Section>
                            </div>
                        </div>
                    )}

                    {activeTab === 'data-sources' && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-dark-700">
                                        <th className="text-left text-xs font-semibold uppercase tracking-wider text-dark-400 py-2 px-3">Data</th>
                                        <th className="text-left text-xs font-semibold uppercase tracking-wider text-dark-400 py-2 px-3">Source</th>
                                        <th className="text-left text-xs font-semibold uppercase tracking-wider text-dark-400 py-2 px-3">Endpoint</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {DATA_SOURCES.map((ds) => (
                                        <tr key={ds.data} className="border-b border-dark-800/50">
                                            <td className="py-2.5 px-3 text-dark-100 font-medium">{ds.data}</td>
                                            <td className="py-2.5 px-3">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${badgeClasses[ds.badge]}`}>
                                                    {ds.source}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-3 font-mono text-xs text-dark-400 break-all">{ds.endpoint}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
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

// ── Icons (inline SVGs) ──────────────────────────────────────────────

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
