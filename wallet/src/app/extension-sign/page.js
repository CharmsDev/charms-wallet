'use client';

/**
 * /extension-sign — passkey signing on behalf of the browser extension.
 *
 * Why this page exists: the extension popup runs on a chrome-extension://
 * origin, and WebAuthn there can only scope a credential to the extension
 * id, never to rpId wallet.charms.dev. A passkey enrolled in the popup
 * would therefore be a different credential and derive a different wallet.
 *
 * This document IS on wallet.charms.dev, so the ceremony is valid here and
 * Touch ID / Face ID prompts normally. The extension delegates to it.
 *
 * Security shape: the mnemonic is derived in this tab, used, and dropped.
 * Only the signed artifact crosses back to the extension, so the extension
 * never holds a secret at rest. That is strictly better than the legacy
 * transfer flow, which copied the plaintext seed into extension storage.
 *
 * Protocol (all via window.postMessage; the extension's content script is
 * already injected on this origin and relays to the service worker):
 *
 *   page → CHARMS_EXT_SIGN_FETCH    { requestId }
 *   cs   → CHARMS_EXT_SIGN_PAYLOAD  { requestId, payload }
 *   page → CHARMS_EXT_SIGN_RESULT   { requestId, result | error }
 */

import { useEffect, useState, useCallback } from 'react';

const STATE = {
  LOADING: 'loading',
  READY:   'ready',
  SIGNING: 'signing',
  DONE:    'done',
  ERROR:   'error',
};

export default function ExtensionSignPage() {
  const [state, setState]   = useState(STATE.LOADING);
  const [payload, setPayload] = useState(null);
  const [error, setError]   = useState('');
  const [requestId, setRequestId] = useState('');

  // Ask the content script for the pending request. The id travels in the
  // URL so a stale tab can never answer a newer request.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('req') || '';
    setRequestId(id);
    if (!id) {
      setError('No signing request referenced by this link.');
      setState(STATE.ERROR);
      return;
    }

    const onMessage = (event) => {
      if (event.source !== window) return;
      const d = event.data;
      if (!d || d.type !== 'CHARMS_EXT_SIGN_PAYLOAD') return;
      if (d.requestId !== id) return;
      if (!d.payload) {
        setError('That signing request is no longer pending. It may have expired or been cancelled in the extension.');
        setState(STATE.ERROR);
        return;
      }
      setPayload(d.payload);
      setState(STATE.READY);
    };
    window.addEventListener('message', onMessage);

    // The content script injects at document_start, but post a couple of
    // times in case this runs before it is listening.
    const ask = () => window.postMessage({ type: 'CHARMS_EXT_SIGN_FETCH', requestId: id }, '*');
    ask();
    const t1 = setTimeout(ask, 300);
    const t2 = setTimeout(() => {
      setState((s) => {
        if (s !== STATE.LOADING) return s;
        setError('The Charms extension did not respond. Make sure it is installed and enabled, then reopen this link from the extension.');
        return STATE.ERROR;
      });
    }, 3000);

    return () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(t1); clearTimeout(t2);
    };
  }, []);

  const reply = useCallback((body) => {
    window.postMessage({ type: 'CHARMS_EXT_SIGN_RESULT', requestId, ...body }, '*');
  }, [requestId]);

  const handleSign = useCallback(async () => {
    setState(STATE.SIGNING);
    setError('');
    let mnemonic = null;
    try {
      // Touch ID / Face ID. Uses the stored credential id, so it goes
      // straight to the platform authenticator with no QR dialog.
      const { unlockPrfWallet } = await import('@/services/auth');
      mnemonic = await unlockPrfWallet();

      const result = await signForExtension(payload, mnemonic);
      reply({ result });
      setState(STATE.DONE);
    } catch (e) {
      const msg = e?.message || 'Signing failed.';
      setError(msg);
      reply({ error: msg });
      setState(STATE.ERROR);
    } finally {
      mnemonic = null;
    }
  }, [payload, reply]);

  const handleReject = useCallback(() => {
    reply({ error: 'Rejected by user.' });
    setState(STATE.DONE);
  }, [reply]);

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-6">
      <div className="card p-6 w-full max-w-md space-y-4">
        <h1 className="text-xl font-bold gradient-text">Approve from your extension</h1>

        {state === STATE.LOADING && (
          <p className="text-sm text-dark-300">Loading the request…</p>
        )}

        {state === STATE.ERROR && (
          <>
            <p className="text-sm text-red-400 break-words">{error}</p>
            <button onClick={() => window.close()} className="btn btn-secondary w-full py-3">Close</button>
          </>
        )}

        {state === STATE.DONE && (
          <>
            <p className="text-sm text-green-400">Done. You can close this tab and return to the extension.</p>
            <button onClick={() => window.close()} className="btn btn-secondary w-full py-3">Close</button>
          </>
        )}

        {(state === STATE.READY || state === STATE.SIGNING) && payload && (
          <>
            <RequestSummary payload={payload} />
            {error && <p className="text-xs text-red-400 break-words">{error}</p>}
            <button
              onClick={handleSign}
              disabled={state === STATE.SIGNING}
              className="btn btn-primary w-full py-3"
            >
              {state === STATE.SIGNING ? 'Waiting for biometric…' : 'Confirm with Face ID / Touch ID'}
            </button>
            <button
              onClick={handleReject}
              disabled={state === STATE.SIGNING}
              className="text-xs text-dark-400 hover:text-dark-200 underline w-full text-center"
            >
              Reject
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function RequestSummary({ payload }) {
  const rows = [];
  if (payload.origin) rows.push(['Requested by', payload.origin]);
  if (payload.kind === 'signMessage') rows.push(['Message', payload.message]);
  if (payload.kind === 'signPsbt')    rows.push(['Transaction', 'PSBT ready to sign']);
  if (payload.kind === 'charmSpell')  rows.push(['Transfer', 'Charm spell ready to sign']);
  if (payload.network) rows.push(['Network', payload.network]);

  return (
    <div className="space-y-2">
      {rows.map(([k, v]) => (
        <div key={k} className="text-sm">
          <div className="text-dark-400 text-xs">{k}</div>
          <div className="text-dark-100 break-all">{String(v).slice(0, 300)}</div>
        </div>
      ))}
      <p className="text-xs text-dark-500 pt-1">
        Your seed phrase never leaves this page. Only the signature is sent
        back to the extension.
      </p>
    </div>
  );
}

/**
 * Run the requested signing operation with the derived mnemonic. Reuses the
 * exact wallet signing code, so the extension inherits any fix made here.
 */
async function signForExtension(payload, mnemonic) {
  const { kind, network } = payload;

  if (kind === 'charmSpell') {
    const { signAndBroadcastTransfer } = await import('@/services/charm-transfer');
    const prevTxMap = new Map(payload.prevTxMapEntries || []);
    const out = await signAndBroadcastTransfer({
      spellTxHex: payload.spellTxHex,
      prevTxMap,
      inputSigningMap: payload.inputSigningMap,
      seedPhrase: mnemonic,
      network,
      onStatus: () => {},
    });
    return { txid: out.txid };
  }

  if (kind === 'signPsbt' || kind === 'signMessage') {
    // Deliberately not implemented in this pass. The PSBT and message
    // signers currently live inside the extension's approve-sign module,
    // not in wallet/src, so wiring them here would mean moving that code
    // into the shared tree first. Charm transfers are the flow that is
    // blocked outright for a passkey wallet, so they go first.
    throw new Error(
      'Signing this request type from the extension is not available yet. ' +
      'Use the wallet at wallet.charms.dev directly.'
    );
  }

  throw new Error(`Unsupported request kind: ${kind}`);
}
