'use client';

/**
 * /extension-link — hand this wallet to the browser extension.
 *
 * Replaces the old plaintext transfer. What crosses is the auth blob and
 * the public address book, never the mnemonic. See
 * `@/services/extension-link` for why that is enough for both wallet
 * types.
 *
 * Protocol (window.postMessage; the extension's content script is
 * already injected on this origin and relays to the service worker):
 *
 *   page → CHARMS_EXT_LINK_ADOPT   { requestId, payload }
 *   cs   → CHARMS_EXT_LINK_RESULT  { requestId, ok | error }
 */

import { useEffect, useState, useCallback } from 'react';
import { collectLinkPayload } from '@/services/extension-link';

const STATE = {
  LOADING: 'loading',
  READY:   'ready',
  LINKING: 'linking',
  DONE:    'done',
  ERROR:   'error',
};

export default function ExtensionLinkPage() {
  const [state, setState] = useState(STATE.LOADING);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState('');

  useEffect(() => {
    setRequestId(new URLSearchParams(window.location.search).get('req') || '');
    (async () => {
      try {
        const collected = await collectLinkPayload();
        if (!collected.walletType) {
          setError('No wallet found on this device. Open your wallet here first, then start the link from the extension again.');
          setState(STATE.ERROR);
          return;
        }
        setInfo(collected);
        setState(STATE.READY);
      } catch (e) {
        setError(e?.message || 'Could not read this wallet.');
        setState(STATE.ERROR);
      }
    })();
  }, []);

  const handleLink = useCallback(() => {
    setState(STATE.LINKING);
    setError('');

    const onMessage = (event) => {
      if (event.source !== window) return;
      const d = event.data;
      if (!d || d.type !== 'CHARMS_EXT_LINK_RESULT') return;
      if (requestId && d.requestId !== requestId) return;
      window.removeEventListener('message', onMessage);
      if (d.ok) {
        setState(STATE.DONE);
      } else {
        setError(d.error || 'The extension refused the link.');
        setState(STATE.ERROR);
      }
    };
    window.addEventListener('message', onMessage);

    window.postMessage({ type: 'CHARMS_EXT_LINK_ADOPT', requestId, payload: info.payload }, '*');

    setTimeout(() => {
      window.removeEventListener('message', onMessage);
      setState((s) => {
        if (s !== STATE.LINKING) return s;
        setError('The Charms extension did not respond. Make sure it is installed and enabled, then start the link from the extension again.');
        return STATE.ERROR;
      });
    }, 8000);
  }, [info, requestId]);

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-6">
      <div className="card p-6 w-full max-w-md space-y-4">
        <h1 className="text-xl font-bold gradient-text">Link the Charms extension</h1>

        {state === STATE.LOADING && <p className="text-sm text-dark-300">Reading this wallet…</p>}

        {state === STATE.ERROR && (
          <>
            <p className="text-sm text-red-400 break-words">{error}</p>
            <button onClick={() => window.close()} className="btn btn-secondary w-full py-3">Close</button>
          </>
        )}

        {state === STATE.DONE && (
          <>
            <p className="text-sm text-green-400">
              Linked. Open the extension to continue.
            </p>
            <button onClick={() => window.close()} className="btn btn-secondary w-full py-3">Close</button>
          </>
        )}

        {(state === STATE.READY || state === STATE.LINKING) && info && (
          <>
            <LinkSummary info={info} />
            <button
              onClick={handleLink}
              disabled={state === STATE.LINKING}
              className="btn btn-primary w-full py-3"
            >
              {state === STATE.LINKING ? 'Linking…' : 'Link this wallet'}
            </button>
            <button
              onClick={() => window.close()}
              disabled={state === STATE.LINKING}
              className="text-xs text-dark-400 hover:text-dark-200 underline w-full text-center"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function LinkSummary({ info }) {
  const isPasskey = info.walletType === 'prf';

  return (
    <div className="space-y-3">
      <div className="text-sm">
        <div className="text-dark-400 text-xs">Protected by</div>
        <div className="text-dark-100">{isPasskey ? 'A passkey' : 'A password'}</div>
      </div>
      <div className="text-sm">
        <div className="text-dark-400 text-xs">Addresses shared</div>
        <div className="text-dark-100">{info.addressCount}</div>
      </div>

      <p className="text-xs text-dark-400">
        {isPasskey
          ? 'Your seed phrase stays here. The extension will show your balance and prepare transactions, then send you back to this page to approve each one with Face ID or Touch ID.'
          : 'Your seed phrase crosses encrypted, exactly as it is stored here. The extension will ask for the same password to unlock it.'}
      </p>
      <p className="text-[10px] text-dark-500">
        Nothing readable leaves this page. The extension refuses a plaintext seed phrase outright.
      </p>
    </div>
  );
}
