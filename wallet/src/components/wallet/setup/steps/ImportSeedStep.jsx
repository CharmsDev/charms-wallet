'use client';

import { useState } from 'react';
import SetupShell from './SetupShell';
import { validateMnemonic } from '@/services/auth';

/** Paste-and-validate. Returns the normalised mnemonic via onSubmit. */
export default function ImportSeedStep({ onSubmit, onBack }) {
  const [val, setVal] = useState('');
  const [err, setErr] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    setErr(null);
    try {
      const normalised = validateMnemonic(val);
      onSubmit(normalised);
    } catch (e2) {
      setErr(e2.message);
    }
  };

  return (
    <SetupShell title="Import seed phrase">
      <p className="text-sm text-dark-300">
        Paste your 12 or 24 word recovery phrase. We'll encrypt it on
        this device — your existing addresses are preserved.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <textarea
          rows={3}
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder="word one word two word three…"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-md text-white placeholder-gray-500"
        />
        {err && <p className="text-xs text-red-400 break-words">{err}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onBack} className="flex-1 btn btn-secondary py-3">
            Back
          </button>
          <button type="submit" className="flex-1 btn btn-primary py-3">
            Continue
          </button>
        </div>
      </form>
    </SetupShell>
  );
}
