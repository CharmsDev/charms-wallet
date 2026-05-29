'use client';

import { useState } from 'react';
import SetupShell from './SetupShell';

/**
 * Display + optional copy of the mnemonic.
 *
 * @param {object} props
 * @param {string}   props.mnemonic
 * @param {boolean}  props.required   if true, ack checkbox mandatory; if false, "Skip" allowed
 * @param {function} props.onContinue
 */
export default function MnemonicBackupStep({ mnemonic, required, onContinue }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ack, setAck] = useState(false);
  const words = (mnemonic || '').split(' ');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mnemonic);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {}
  };

  const canProceed = required ? (revealed && ack) : true;

  return (
    <SetupShell title="Back up your seed phrase">
      <p className="text-sm text-yellow-300">
        Write these {words.length} words down on paper, in order.{' '}
        {required
          ? 'They are your ONLY recovery if you forget your password.'
          : 'Optional — your passkey already protects this wallet. Use this only if you might lose access to all your synced devices.'}
      </p>

      <div className="relative">
        <div className="grid grid-cols-2 gap-2">
          {words.map((w, i) => (
            <div key={i} className="bg-dark-800 p-2 rounded-lg border border-dark-700 text-xs">
              <span className="text-primary-400 mr-1">{i + 1}.</span>
              <span className="text-white font-mono">{revealed ? w : '••••••••'}</span>
            </div>
          ))}
        </div>
        {!revealed && (
          <button onClick={() => setRevealed(true)} className="absolute inset-0 flex items-center justify-center bg-dark-900/90 rounded-lg">
            <span className="text-white font-medium text-sm">Tap to reveal</span>
          </button>
        )}
      </div>

      {revealed && (
        <button onClick={copy} className="w-full py-2 rounded bg-dark-700 hover:bg-dark-600 text-white text-sm">
          {copied ? '✓ Copied to clipboard' : 'Copy seed phrase'}
        </button>
      )}

      {required && (
        <label className="flex items-start gap-2 text-sm text-dark-200">
          <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="mt-1" />
          <span>I have saved my seed phrase offline. I understand that losing my password and this written backup means losing my wallet permanently.</span>
        </label>
      )}

      <div className="flex gap-3">
        {!required && (
          <button onClick={onContinue} className="flex-1 btn btn-secondary py-3">
            Skip — trust my passkey
          </button>
        )}
        <button
          onClick={onContinue}
          disabled={!canProceed}
          className="flex-1 btn btn-primary py-3 disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    </SetupShell>
  );
}
