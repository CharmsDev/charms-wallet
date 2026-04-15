'use client';

/**
 * Beam Test Dashboard — config + links to individual step tests.
 * URL: /beam-test
 */

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'beam_test_context';

const DEFAULT_CONFIG = {
  seedPhrase: '',
  tokenAppId: '',
  beamAmount: 133000000,        // 1.33 BRO in raw units
  cardanoAddress: '',
  btcChangeAddress: '',
  btcNetwork: 'mainnet',
  adaNetwork: 'mainnet',
  // Results from steps (accumulated)
  placeholderTxHash: '',
  placeholderOutputIndex: 0,
  btcTxid: '',
  spellTxHex: '',
  adaClaimTxid: '',
};

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
  } catch { return { ...DEFAULT_CONFIG }; }
}

function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export default function BeamTestDashboard() {
  const [cfg, setCfg] = useState(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setCfg(loadConfig()); }, []);

  const update = (key, value) => setCfg(prev => ({ ...prev, [key]: value }));

  const handleSave = () => {
    saveConfig(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY);
    setCfg({ ...DEFAULT_CONFIG });
  };

  const Field = ({ label, field, type = 'text', mono = false }) => (
    <div className="mb-3">
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {type === 'textarea' ? (
        <textarea
          value={cfg[field] || ''}
          onChange={e => update(field, e.target.value)}
          rows={3}
          className={`w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white ${mono ? 'font-mono text-xs' : ''}`}
        />
      ) : (
        <input
          type={type}
          value={cfg[field] || ''}
          onChange={e => update(field, type === 'number' ? Number(e.target.value) : e.target.value)}
          className={`w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white ${mono ? 'font-mono text-xs' : ''}`}
        />
      )}
    </div>
  );

  const ResultField = ({ label, field }) => (
    <div className="flex justify-between text-xs py-1 border-b border-gray-800">
      <span className="text-gray-500">{label}</span>
      <span className="font-mono text-green-400 max-w-[300px] truncate">{cfg[field] || '—'}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Beam Test Dashboard</h1>
      <p className="text-gray-500 text-sm mb-6">Configure params, then run each step in isolation.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Config */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h2 className="text-sm font-bold text-gray-300 mb-3">Configuration</h2>
          <Field label="Seed Phrase" field="seedPhrase" type="textarea" mono />
          <Field label="BRO Token App ID" field="tokenAppId" mono />
          <Field label="Beam Amount (raw units)" field="beamAmount" type="number" />
          <Field label="Cardano Address" field="cardanoAddress" mono />
          <Field label="BTC Change Address" field="btcChangeAddress" mono />
          <div className="grid grid-cols-2 gap-2">
            <Field label="BTC Network" field="btcNetwork" />
            <Field label="ADA Network" field="adaNetwork" />
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={handleSave} className="flex-1 py-2 rounded bg-purple-600 hover:bg-purple-700 text-sm font-medium">
              {saved ? 'Saved!' : 'Save Config'}
            </button>
            <button onClick={handleClear} className="px-4 py-2 rounded bg-gray-800 hover:bg-gray-700 text-sm text-gray-400">
              Clear
            </button>
          </div>
        </div>

        {/* Results + Steps */}
        <div className="space-y-4">
          {/* Accumulated results */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">Accumulated Results</h2>
            <ResultField label="Placeholder TxHash" field="placeholderTxHash" />
            <ResultField label="Placeholder OutputIndex" field="placeholderOutputIndex" />
            <ResultField label="BTC Beam TxId" field="btcTxid" />
            <ResultField label="ADA Claim TxId" field="adaClaimTxid" />
          </div>

          {/* Step links */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">Steps</h2>
            <div className="space-y-2">
              <StepLink n={1} label="Create Cardano Placeholder" href="/beam-test/step1" ready={!!cfg.seedPhrase && !!cfg.cardanoAddress} />
              <StepLink n={2} label="Wait Cardano Confirmation" href="/beam-test/step2" ready={!!cfg.placeholderTxHash} />
              <StepLink n={3} label="Build Spell + Prove BTC" href="/beam-test/step3" ready={!!cfg.placeholderTxHash} />
              <StepLink n={4} label="Sign + Broadcast BTC" href="/beam-test/step4" ready={!!cfg.spellTxHex} />
              <StepLink n={5} label="Wait BTC Finality" href="/beam-test/step5" ready={!!cfg.btcTxid} />
              <StepLink n={6} label="Claim on Cardano" href="/beam-test/step6" ready={!!cfg.btcTxid && !!cfg.placeholderTxHash} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepLink({ n, label, href, ready }) {
  return (
    <a
      href={href}
      className={`flex items-center gap-3 p-2 rounded border transition-colors ${
        ready ? 'border-purple-600/40 bg-purple-900/10 hover:bg-purple-900/20 text-white' : 'border-gray-800 bg-gray-900/50 text-gray-600 pointer-events-none'
      }`}
    >
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
        ready ? 'bg-purple-600/30 text-purple-300' : 'bg-gray-800 text-gray-600'
      }`}>{n}</span>
      <span className="text-sm">{label}</span>
      {!ready && <span className="text-xs text-gray-700 ml-auto">needs config</span>}
    </a>
  );
}
