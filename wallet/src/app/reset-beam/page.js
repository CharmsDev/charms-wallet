'use client';

/**
 * TEMPORARY page — delete after 2026-04-21.
 * Purges all beam-related state from localStorage so a fresh beam can start
 * cleanly. Needed once to recover from mid-refactor state corruption.
 */

import { useState } from 'react';

const KEYS = [
  'charms_beam_operations',
  'charms_utxo_reservations',
];

export default function ResetBeamPage() {
  const [result, setResult] = useState(null);

  const run = () => {
    const before = {};
    const cleared = [];
    for (const k of KEYS) {
      before[k] = localStorage.getItem(k);
      if (before[k] != null) {
        localStorage.removeItem(k);
        cleared.push(k);
      }
    }
    setResult({ cleared, before });
  };

  return (
    <div style={{ padding: 24, fontFamily: 'ui-monospace,monospace', color: '#ddd', background: '#111', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '1.2rem', marginBottom: 12 }}>Reset Beam State</h1>
      <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: 16 }}>
        Clears <code>{KEYS.join(', ')}</code> from localStorage. Use this once to recover from
        stale beam operations after refactor. After clearing, navigate back and start a fresh beam.
      </p>
      <button
        onClick={run}
        style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
      >
        Clear beam state
      </button>
      {result && (
        <div style={{ marginTop: 20 }}>
          <div style={{ color: '#22c55e' }}>✓ Cleared {result.cleared.length} key(s)</div>
          <pre style={{ fontSize: '0.7rem', color: '#666', marginTop: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
          <a href="/" style={{ display: 'inline-block', marginTop: 16, color: '#60a5fa' }}>← Back to wallet</a>
        </div>
      )}
    </div>
  );
}
