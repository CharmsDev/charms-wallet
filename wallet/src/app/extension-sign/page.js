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
import * as bitcoin from 'bitcoinjs-lib';

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

function Row({ label, value }) {
  return (
    <div className="text-sm">
      <div className="text-dark-400 text-xs">{label}</div>
      <div className="text-dark-100 break-all">{String(value).slice(0, 300)}</div>
    </div>
  );
}

function RequestSummary({ payload }) {
  return (
    <div className="space-y-2">
      {payload.origin && <Row label="Requested by" value={payload.origin} />}
      {payload.network && <Row label="Network" value={payload.network} />}
      {payload.kind === 'signMessage' && <Row label="Message" value={payload.message} />}
      {payload.kind === 'charmSpell' && <Row label="Transfer" value="Charm spell ready to sign" />}
      {payload.kind === 'signPsbt' && <PsbtSummary psbtHex={payload.psbtHex} />}
      {payload.kind === 'btcTransfer' && (
        <>
          <Row label="Sending" value={`${(payload.amountInSats / 100_000_000).toFixed(8)} BTC`} />
          <Row label="To" value={payload.destinationAddress} />
          <Row label="Fee rate" value={`${payload.feeRate} sat/vB`} />
        </>
      )}
      <p className="text-xs text-dark-500 pt-1">
        Your seed phrase never leaves this page. Only the signature is sent
        back to the extension.
      </p>
    </div>
  );
}

/**
 * Show what the PSBT actually does. The user is approving here rather than
 * in the extension popup, so this tab has to carry the same detail the
 * popup would have shown, not just a "sign this" button.
 */
function PsbtSummary({ psbtHex }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    try {
      const psbt = bitcoin.Psbt.fromHex(psbtHex);
      const outputs = psbt.txOutputs.map((o) => ({
        address: o.address || '(script)',
        value: Number(o.value),
      }));
      setInfo({
        inputCount: psbt.inputCount,
        outputs,
        total: outputs.reduce((sum, o) => sum + o.value, 0),
      });
    } catch {
      // Unparseable here does not mean unsignable; the signer decides.
      setInfo({ inputCount: null, outputs: [], total: null });
    }
  }, [psbtHex]);

  if (!info || info.inputCount === null) {
    return <Row label="Transaction" value="PSBT ready to sign" />;
  }

  return (
    <div className="space-y-2">
      <Row label="Transaction" value={`${info.inputCount} in, ${info.outputs.length} out`} />
      <Row label="Total output" value={`${(info.total / 100_000_000).toFixed(8)} BTC`} />
      {info.outputs.length > 0 && info.outputs.length <= 8 && (
        <div className="border-t border-dark-800 pt-2 space-y-1">
          {info.outputs.map((o, i) => (
            <div key={i} className="flex justify-between gap-2 text-xs font-mono">
              <span className="text-dark-400 truncate">{o.address}</span>
              <span className="text-dark-200 shrink-0">{o.value.toLocaleString()} sats</span>
            </div>
          ))}
        </div>
      )}
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

  // A plain BTC send from a watch-only extension. The extension did the
  // UTXO selection and the fee maths, which need no secret; this runs the
  // same orchestrator the web wallet uses, with the selection handed in.
  //
  // Two things it reads from this origin's storage rather than the
  // payload: the address book, which is correct because this origin is
  // where the wallet lives, and the charm cache, used only for a
  // belt-and-braces check that the extension already made during
  // selection. Broadcasting stays with the extension so its balance
  // bookkeeping owns the txid.
  if (kind === 'btcTransfer') {
    const { BitcoinTransactionOrchestrator } = await import('@/services/bitcoin/transaction-orchestrator');
    const orchestrator = new BitcoinTransactionOrchestrator(network);
    const out = await orchestrator.processTransaction(
      payload.destinationAddress,
      payload.amountInSats,
      payload.utxos,
      payload.feeRate,
      null,
      mnemonic,
    );
    if (!out?.success) throw new Error(out?.error || 'Transaction signing failed');
    return {
      success: true,
      signedTxHex:   out.signedTxHex,
      txid:          out.txid,
      selectedUtxos: out.selectedUtxos,
      totalSelected: out.totalSelected,
      estimatedFee:  out.estimatedFee,
      change:        out.change,
      changeAddress: out.changeAddress,
    };
  }

  // The addresses arrive from the extension, but they are not taken on
  // trust: deriveKeyMap only keeps an address whose key it can actually
  // reproduce from this mnemonic, so an address we do not own yields no
  // key rather than a signature.
  if (kind === 'signPsbt') {
    const { signPsbtWithKeys } = await import('@/services/signing');
    const signedPsbtHex = await signPsbtWithKeys(
      payload.psbtHex,
      payload.options,
      mnemonic,
      network,
      payload.addresses || [],
    );
    return { signedPsbtHex };
  }

  if (kind === 'signMessage') {
    const { signMessageWithKeys } = await import('@/services/signing');
    const signature = await signMessageWithKeys(
      payload.message,
      mnemonic,
      network,
      payload.addresses || [],
    );
    return { signature };
  }

  throw new Error(`Unsupported request kind: ${kind}`);
}
