/**
 * PSBT Signing Approval Page
 *
 * Separate Vite entry point. The signing primitives themselves live in
 * wallet/src/services/signing and are imported through the @/ alias, so
 * the popup and the /extension-sign page run identical code.
 *
 * Flow:
 * 1. background.js stores ext:pending_sign in chrome.storage.local
 * 2. This popup reads the request, displays TX details
 * 3. User approves → signs PSBT with derived private keys → stores ext:sign_response
 * 4. background.js polls for ext:sign_response → returns signed hex to dApp
 */

import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  SYSTEM_KEYS,
  EXT_KEYS,
  netKey,
  DATA_TYPES,
} from '@/services/storage-keys';
import * as bitcoin from 'bitcoinjs-lib';
import {
  signPsbtWithKeys,
  signMessageWithKeys,
  isP2wpkhAddress,
} from '@/services/signing';

/**
 * Safely parse addresses from storage — handles both JSON strings and already-parsed arrays
 */
function safeParse(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

// ============================================================
// React UI Component
// ============================================================

// Storage keys imported via the @/ alias — single source of truth in
// wallet/src/services/storage-keys.js. PENDING_PROOF + PROVING_STATUS are
// extension-only (offscreen prover); kept as local string literals here
// because the wallet has no equivalent.
const EXT_PENDING_SIGN  = EXT_KEYS.PENDING_SIGN;
const EXT_PENDING_PROOF = 'ext:pending_proof';
const EXT_SIGN_RESPONSE = EXT_KEYS.SIGN_RESPONSE;
const SK_SEED_PHRASE    = SYSTEM_KEYS.SEED_PHRASE;
const SK_ACTIVE_NETWORK = SYSTEM_KEYS.ACTIVE_NETWORK;
const addrKey = (bc, net) => netKey(bc, net, DATA_TYPES.ADDRESSES);

function shortenAddr(addr) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

/**
 * Resolve the mnemonic for a signing ceremony (G003).
 *
 * This document is opened fresh for every request, so it never shares the
 * popup's in-RAM seed and has to establish the secret on its own:
 *
 *   Type 2 (password)  decrypt the stored blob with the password the user
 *                      types here. This is the supported extension path.
 *   Type 1 (PRF)       not possible. Deriving it needs WebAuthn against
 *                      rpId wallet.charms.dev, and a chrome-extension://
 *                      origin can only scope credentials to the extension
 *                      id. Fail with an explicit message instead of the
 *                      old generic 'Seed phrase not found in wallet'.
 *   no blob            legacy plaintext wallet, or one transferred from
 *                      the web wallet. Read the key as before.
 *
 * @returns {Promise<string>} the mnemonic; callers must not persist it
 */
async function resolveSigningSeed(password) {
  const { getWalletType, unlockPasswordWallet } = await import('@/services/auth');
  const walletType = await getWalletType();

  if (walletType === 'password') {
    if (!password) {
      const err = new Error('Password required to sign.');
      err.code = 'PASSWORD_REQUIRED';
      throw err;
    }
    return await unlockPasswordWallet({ password });
  }

  if (walletType === 'prf') {
    // Handled by delegating the whole ceremony to a wallet.charms.dev tab,
    // never by deriving here. See signViaPasskeyDelegation().
    const err = new Error('Passkey wallet — approve in the wallet tab.');
    err.code = 'PASSKEY_DELEGATION_REQUIRED';
    throw err;
  }

  const stored = await chrome.storage.local.get([SK_SEED_PHRASE]);
  const seedPhrase = stored[SK_SEED_PHRASE];
  if (!seedPhrase) throw new Error('No wallet found in this extension.');
  return seedPhrase;
}

const EXT_SIGN_PENDING = 'ext:sign_delegate_pending';
const EXT_SIGN_RESULT  = 'ext:sign_delegate_result';
const WALLET_ORIGIN    = 'https://wallet.charms.dev';

/**
 * Delegate a signing ceremony to a wallet.charms.dev tab.
 *
 * A passkey for rpId wallet.charms.dev cannot be exercised from this
 * document, but it can from a page on that origin, where Touch ID / Face
 * ID prompts normally. We park the request, open the tab, and wait for the
 * signed artifact. The mnemonic is derived and dropped over there, so the
 * extension only ever receives a signature.
 *
 * @returns {Promise<any>} whatever the page produced for this request kind
 */
async function signViaPasskeyDelegation(payload, { onStatus } = {}) {
  const requestId = `sig-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await chrome.storage.local.set({ [EXT_SIGN_PENDING]: { requestId, payload, at: Date.now() } });
  await chrome.storage.local.remove(EXT_SIGN_RESULT);

  const tab = await chrome.tabs.create({
    url: `${WALLET_ORIGIN}/extension-sign?req=${encodeURIComponent(requestId)}`,
    active: true,
  });
  onStatus?.('Approve in the wallet tab that just opened…');

  // Poll rather than message-listen: this popup can be closed and reopened
  // while the user is in the other tab, and storage survives that.
  const TIMEOUT_MS = 5 * 60 * 1000;
  const started = Date.now();
  try {
    while (Date.now() - started < TIMEOUT_MS) {
      const data = await chrome.storage.local.get([EXT_SIGN_RESULT]);
      const res = data[EXT_SIGN_RESULT];
      if (res && res.requestId === requestId) {
        await chrome.storage.local.remove(EXT_SIGN_RESULT);
        if (res.error) throw new Error(res.error);
        return res.result;
      }
      await new Promise(r => setTimeout(r, 400));
    }
    throw new Error('Timed out waiting for approval in the wallet tab.');
  } finally {
    await chrome.storage.local.remove(EXT_SIGN_PENDING);
    try { await chrome.tabs.remove(tab.id); } catch (_) { /* user may have closed it */ }
  }
}

function SignApproval() {
  // PSBT / message signing state
  const [request, setRequest] = useState(null);
  const [psbtInfo, setPsbtInfo] = useState(null);

  // Charm transfer (BRO proof) state
  const [pendingProof, setPendingProof] = useState(null);
  const [txid, setTxid] = useState(null);

  // Shared state
  const [mode, setMode] = useState(null); // 'psbt' | 'charm'
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  // G003 Type 2 unlock. `needsPassword` is set when a signing attempt
  // reports PASSWORD_REQUIRED, which turns the field on without having to
  // probe storage on mount.
  const [walletType, setWalletType] = useState(null);
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { getWalletType } = await import('@/services/auth');
        const t = await getWalletType();
        setWalletType(t);
        if (t === 'password') setNeedsPassword(true);
      } catch (_) { /* legacy wallet — plaintext path handles it */ }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const data = await chrome.storage.local.get([EXT_PENDING_SIGN, EXT_PENDING_PROOF]);

      // Charm transfer takes priority (background opens this page when proof is ready)
      const pp = data[EXT_PENDING_PROOF];
      if (pp?.status === 'ready') {
        setPendingProof(pp);
        setMode('charm');
        return;
      }

      const req = data[EXT_PENDING_SIGN];
      if (!req) {
        setError('No pending request found');
        return;
      }
      setMode('psbt');
      setRequest(req);

      // Parse PSBT to show details
      try {
        const psbt = bitcoin.Psbt.fromHex(req.psbtHex);
        const inputCount = psbt.inputCount;
        const outputCount = psbt.txOutputs.length;
        let totalOutput = 0n;
        const outputs = psbt.txOutputs.map((out, i) => {
          totalOutput += BigInt(out.value);
          return { index: i, value: Number(out.value), address: out.address || '(script)' };
        });
        setPsbtInfo({ inputCount, outputCount, outputs, totalOutput: Number(totalOutput) });
      } catch (e) {
        console.warn('[approve-sign] Could not parse PSBT for display:', e);
        setPsbtInfo({ inputCount: '?', outputCount: '?', outputs: [], totalOutput: 0 });
      }
    })();
  }, []);

  // ── Cancel handlers ──────────────────────────────────────────────────────────

  const handleCancelPsbt = async () => {
    await chrome.storage.local.set({
      [EXT_SIGN_RESPONSE]: { approved: false, requestId: request.id, error: 'User rejected the signing request' }
    });
    await chrome.storage.local.remove(EXT_PENDING_SIGN);
    window.close();
  };

  const handleCancelCharm = async () => {
    await chrome.storage.local.remove([EXT_PENDING_PROOF]);
    window.close();
  };

  // ── Sign: PSBT / message ─────────────────────────────────────────────────────

  const handleSignPsbt = async () => {
    setSigning(true);
    setError(null);
    try {
      const mainnetKey = addrKey('bitcoin', 'mainnet');
      const testnetKey = addrKey('bitcoin', 'testnet4');
      const storageData = await chrome.storage.local.get([SK_ACTIVE_NETWORK, mainnetKey, testnetKey]);
      const seedPhrase = await resolveSigningSeed(password);
      const networkName = storageData[SK_ACTIVE_NETWORK] || 'mainnet';
      let addresses = safeParse(storageData[addrKey('bitcoin', networkName)]);
      if (addresses.length === 0) {
        const fallback = networkName === 'mainnet' ? 'testnet4' : 'mainnet';
        addresses = safeParse(storageData[addrKey('bitcoin', fallback)]);
      }
      if (addresses.length === 0) throw new Error('No wallet addresses found');

      if (request.type === 'signMessage') {
        let signingAddresses = addresses;
        if (request.signingAddress) {
          // Explicit address from caller — look up by address string
          const filtered = addresses.filter(a => (a?.address || a) === request.signingAddress);
          if (filtered.length > 0) signingAddresses = filtered;
        } else if (request.connectedAddresses?.length > 0) {
          // Fallback: filter to site's connected addresses, P2WPKH first
          const connectedSet = new Set(request.connectedAddresses);
          const filtered = addresses.filter(a => connectedSet.has(a?.address || a));
          if (filtered.length > 0) {
            signingAddresses = [
              ...filtered.filter(a => isP2wpkhAddress(a?.address || a)),
              ...filtered.filter(a => !isP2wpkhAddress(a?.address || a)),
            ];
          }
        }
        const signature = await signMessageWithKeys(request.message, seedPhrase, networkName, signingAddresses);
        await chrome.storage.local.set({ [EXT_SIGN_RESPONSE]: { approved: true, requestId: request.id, signature } });
      } else {
        const signedPsbtHex = await signPsbtWithKeys(request.psbtHex, request.options, seedPhrase, networkName, addresses);
        await chrome.storage.local.set({ [EXT_SIGN_RESPONSE]: { approved: true, requestId: request.id, signedPsbtHex } });
      }
      await chrome.storage.local.remove(EXT_PENDING_SIGN);
      window.close();
    } catch (err) {
      console.error('[approve-sign] Signing error:', err);
      // A Type 2 wallet reaching here without a password just needs the
      // field revealed, not an error shouted at the user.
      if (err.code === 'PASSWORD_REQUIRED') {
        setNeedsPassword(true);
        setError('Enter your wallet password to sign.');
      } else if (err.code === 'PASSKEY_DELEGATION_REQUIRED') {
        // The PSBT and message signers still live in this file rather than
        // wallet/src, so the wallet tab has nothing to call yet. Say so
        // plainly instead of surfacing the internal delegation error.
        setError(
          'This wallet is secured by a passkey. Signing dApp requests from ' +
          'the extension is not available yet — approve it at wallet.charms.dev.'
        );
      } else {
        setError(err.message);
      }
      setSigning(false);
    }
  };

  // ── Sign + broadcast: Charm transfer ─────────────────────────────────────────

  const handleSignCharm = async () => {
    setSigning(true);
    setError(null);
    try {
      const storageData = await chrome.storage.local.get([SK_ACTIVE_NETWORK]);
      const network = pendingProof.meta?.network || storageData[SK_ACTIVE_NETWORK] || 'mainnet';

      let result;
      try {
        const seedPhrase = await resolveSigningSeed(password);
        const { signAndBroadcastTransfer } = await import('@/services/charm-transfer');
        const prevTxMap = new Map(pendingProof.prevTxMapEntries || []);
        result = await signAndBroadcastTransfer({
          spellTxHex: pendingProof.spellTxHex,
          prevTxMap,
          inputSigningMap: pendingProof.meta?.inputSigningMap,
          seedPhrase,
          network,
          onStatus: () => {},
        });
      } catch (e) {
        if (e.code !== 'PASSKEY_DELEGATION_REQUIRED') throw e;
        // Passkey wallet: the ceremony and the signing both happen in a
        // wallet.charms.dev tab, and only the txid comes back.
        setError('Approve in the wallet tab that just opened…');
        result = await signViaPasskeyDelegation({
          kind: 'charmSpell',
          network,
          spellTxHex:       pendingProof.spellTxHex,
          prevTxMapEntries: pendingProof.prevTxMapEntries || [],
          inputSigningMap:  pendingProof.meta?.inputSigningMap,
        }, { onStatus: setError });
        setError(null);
      }

      await chrome.storage.local.remove([EXT_PENDING_PROOF]);
      setTxid(result.txid);
    } catch (err) {
      console.error('[approve-sign] Charm sign error:', err);
      if (err.code === 'PASSWORD_REQUIRED') {
        setNeedsPassword(true);
        setError('Enter your wallet password to sign.');
      } else {
        setError(err.message);
      }
      setSigning(false);
    }
  };

  // ── Loading / error state (no request yet) ───────────────────────────────────

  if (!mode) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.logo}>₿</div>
          <div>
            <div style={styles.title}>Charms Wallet</div>
            <div style={styles.subtitle}>Sign Transaction</div>
          </div>
        </div>
        {error ? <div style={styles.error}>{error}</div> : <div style={styles.loading}>Loading...</div>}
      </div>
    );
  }

  // ── Charm transfer UI ────────────────────────────────────────────────────────

  if (mode === 'charm') {
    const meta = pendingProof.meta || {};
    const TOKEN_DECIMALS = 100_000_000;
    const displayAmount = meta.displayAmount || '?';
    const symbol = meta.symbol || 'Token';
    const recipient = meta.recipient || '?';
    const fee = pendingProof.fee;
    const txBytes = pendingProof.spellTxHex ? Math.round(pendingProof.spellTxHex.length / 2) : '?';
    const mempoolBase = (meta.network === 'mainnet') ? 'https://mempool.space' : 'https://mempool.space/testnet4';

    // Success screen
    if (txid) {
      return (
        <div style={styles.container}>
          <div style={styles.header}>
            <div style={{ ...styles.logo, background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}>✓</div>
            <div>
              <div style={styles.title}>Tokens Sent!</div>
              <div style={styles.subtitle}>Broadcast to Bitcoin network</div>
            </div>
          </div>
          <div style={styles.txDetails}>
            <div style={styles.txRow}><span style={styles.txLabel}>Amount</span><span style={{ ...styles.txValue, color: '#f7931a' }}>{displayAmount} {symbol}</span></div>
            <div style={styles.txRow}><span style={styles.txLabel}>To</span><span style={styles.txValue}>{shortenAddr(recipient)}</span></div>
            <div style={{ ...styles.txRow, wordBreak: 'break-all', flexDirection: 'column', gap: 4 }}>
              <span style={styles.txLabel}>Transaction ID</span>
              <span style={{ ...styles.txValue, fontSize: 11 }}>{txid}</span>
            </div>
          </div>
          <div style={styles.buttons}>
            <a href={`${mempoolBase}/tx/${txid}`} target="_blank" rel="noopener noreferrer"
              style={{ ...styles.btnCancel, textAlign: 'center', textDecoration: 'none', lineHeight: '44px' }}>
              View on Mempool
            </a>
            <button style={styles.btnSign} onClick={() => window.close()}>Done</button>
          </div>
        </div>
      );
    }

    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.logo}>₿</div>
          <div>
            <div style={styles.title}>Charms Wallet</div>
            <div style={styles.subtitle}>Confirm Token Transfer</div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.siteInfo}>
            <div style={styles.siteIcon}>🪙</div>
            <div style={styles.siteName}>{displayAmount} {symbol}</div>
            <div style={styles.siteUrl}>ZK proof verified — ready to sign</div>
          </div>
        </div>

        <div style={styles.txDetails}>
          <div style={styles.txRow}><span style={styles.txLabel}>Token</span><span style={{ ...styles.txValue, color: '#f7931a' }}>{symbol}</span></div>
          <div style={styles.txRow}><span style={styles.txLabel}>Amount</span><span style={styles.txValue}>{displayAmount}</span></div>
          <div style={styles.txRow}><span style={styles.txLabel}>To</span><span style={styles.txValue}>{shortenAddr(recipient)}</span></div>
          <div style={styles.txRow}><span style={styles.txLabel}>Network Fee</span><span style={styles.txValue}>{fee != null ? `${fee} sats` : '—'}</span></div>
          <div style={styles.txRow}><span style={styles.txLabel}>TX Size</span><span style={styles.txValue}>{txBytes} bytes</span></div>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {needsPassword && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Wallet password"
            autoFocus
            style={styles.passwordInput}
            disabled={signing}
          />
        )}

        <div style={styles.buttons}>
          <button style={styles.btnCancel} onClick={handleCancelCharm} disabled={signing}>Cancel</button>
          <button
            style={signing || (needsPassword && !password) ? styles.btnSignDisabled : styles.btnSign}
            onClick={handleSignCharm}
            disabled={signing || (needsPassword && !password)}
          >
            {signing ? 'Signing…' : 'Confirm & Sign'}
          </button>
        </div>
      </div>
    );
  }

  // ── PSBT / message UI ────────────────────────────────────────────────────────

  const orderInfo = request.options?.orderInfo;

  // Build order summary text
  const orderSummary = (() => {
    if (!orderInfo) return null;
    const { action, side, tokenAmount, totalSats, tokenSymbol } = orderInfo;
    const sats = totalSats?.toLocaleString() || '?';
    const tokens = tokenAmount != null ? (tokenAmount / 100_000_000).toFixed(8) : '?';
    const sym = tokenSymbol || 'Token';

    if (action === 'fill') {
      if (side === 'ask') {
        return { label: 'Fill Ask Order', desc: `Buy ${tokens} ${sym} for ${sats} sats`, icon: '🟢' };
      } else {
        return { label: 'Fill Bid Order', desc: `Sell ${tokens} ${sym} for ${sats} sats`, icon: '🔴' };
      }
    } else if (action === 'cancel') {
      return { label: `Cancel ${side.toUpperCase()} Order`, desc: `Return ${tokens} ${sym} (${sats} sats)`, icon: '✕' };
    } else if (action === 'create') {
      if (side === 'ask') {
        return { label: 'Create Ask Order', desc: `Sell ${tokens} ${sym} at ${sats} sats`, icon: '📤' };
      } else {
        return { label: 'Create Bid Order', desc: `Buy ${tokens} ${sym} at ${sats} sats`, icon: '📥' };
      }
    }
    return null;
  })();

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.logo}>₿</div>
        <div>
          <div style={styles.title}>Charms Wallet</div>
          <div style={styles.subtitle}>{request.type === 'signMessage' ? 'Sign Message' : 'Sign Transaction'}</div>
        </div>
      </div>

      {/* Order Summary Card */}
      {orderSummary ? (
        <div style={styles.card}>
          <div style={styles.siteInfo}>
            <div style={styles.siteIcon}>{orderSummary.icon}</div>
            <div style={styles.siteName}>{orderSummary.label}</div>
            <div style={styles.siteUrl}>{orderSummary.desc}</div>
          </div>
        </div>
      ) : (
        <div style={styles.card}>
          <div style={styles.siteInfo}>
            <div style={styles.siteIcon}>{request.type === 'signMessage' ? '✉️' : '🔏'}</div>
            <div style={styles.siteName}>{request.type === 'signMessage' ? 'Message Signing' : 'Transaction'}</div>
            <div style={styles.siteUrl}>{request.origin}</div>
          </div>
        </div>
      )}

      {/* Order details */}
      {orderInfo && (
        <div style={styles.txDetails}>
          <div style={styles.txRow}><span style={styles.txLabel}>Action</span><span style={styles.txValue}>{orderSummary?.label}</span></div>
          <div style={styles.txRow}><span style={styles.txLabel}>{orderInfo.tokenSymbol || 'Tokens'}</span><span style={{ ...styles.txValue, color: '#f7931a' }}>{(orderInfo.tokenAmount / 100_000_000).toFixed(8)}</span></div>
          <div style={styles.txRow}><span style={styles.txLabel}>BTC</span><span style={styles.txValue}>{orderInfo.totalSats?.toLocaleString()} sats</span></div>
        </div>
      )}

      {request.type === 'signMessage' && (
        <div style={styles.txDetails}>
          <div style={styles.txRow}><span style={styles.txLabel}>Message</span></div>
          <div style={{ ...styles.txRow, wordBreak: 'break-all', fontSize: '12px', color: '#94a3b8' }}>{request.message}</div>
        </div>
      )}

      {/* TX Details: collapsible when orderInfo present, always shown otherwise */}
      {!request.type && psbtInfo && (orderInfo ? (
        <>
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <span onClick={() => setShowDetails(!showDetails)}
              style={{ fontSize: 12, color: '#f7931a', cursor: 'pointer', userSelect: 'none' }}>
              {showDetails ? '▾ Hide TX details' : '▸ Show TX details'}
            </span>
          </div>
          {showDetails && (
            <div style={styles.txDetails}>
              <div style={styles.txRow}><span style={styles.txLabel}>Inputs</span><span style={styles.txValue}>{psbtInfo.inputCount}</span></div>
              <div style={styles.txRow}><span style={styles.txLabel}>Outputs</span><span style={styles.txValue}>{psbtInfo.outputCount}</span></div>
              <div style={styles.txRow}><span style={styles.txLabel}>Total Output</span><span style={styles.txValue}>{(psbtInfo.totalOutput / 100_000_000).toFixed(8)} BTC</span></div>
              {psbtInfo.outputs.length > 0 && psbtInfo.outputs.length <= 8 && (
                <div style={styles.outputList}>
                  {psbtInfo.outputs.map((out, i) => (
                    <div key={i} style={styles.outputItem}>
                      <span style={styles.outputAddr}>{out.address.length > 20 ? out.address.slice(0, 10) + '...' + out.address.slice(-8) : out.address}</span>
                      <span style={styles.outputValue}>{out.value.toLocaleString()} sats</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div style={styles.txDetails}>
          <div style={styles.txRow}><span style={styles.txLabel}>Inputs</span><span style={styles.txValue}>{psbtInfo.inputCount}</span></div>
          <div style={styles.txRow}><span style={styles.txLabel}>Outputs</span><span style={styles.txValue}>{psbtInfo.outputCount}</span></div>
          <div style={styles.txRow}><span style={styles.txLabel}>Total Output</span><span style={styles.txValue}>{(psbtInfo.totalOutput / 100_000_000).toFixed(8)} BTC</span></div>
          {psbtInfo.outputs.length > 0 && psbtInfo.outputs.length <= 8 && (
            <div style={styles.outputList}>
              {psbtInfo.outputs.map((out, i) => (
                <div key={i} style={styles.outputItem}>
                  <span style={styles.outputAddr}>{out.address.length > 20 ? out.address.slice(0, 10) + '...' + out.address.slice(-8) : out.address}</span>
                  <span style={styles.outputValue}>{out.value.toLocaleString()} sats</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {error && <div style={styles.error}>{error}</div>}

      {needsPassword && (
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Wallet password"
          autoFocus
          style={styles.passwordInput}
          disabled={signing}
        />
      )}

      <div style={styles.buttons}>
        <button style={styles.btnCancel} onClick={handleCancelPsbt} disabled={signing}>Cancel</button>
        <button
          style={signing || (needsPassword && !password) ? styles.btnSignDisabled : styles.btnSign}
          onClick={handleSignPsbt}
          disabled={signing || (needsPassword && !password)}
        >
          {signing ? 'Signing...' : 'Sign'}
        </button>
      </div>
    </div>
  );
}

// Inline styles (same design language as approve.html)
const styles = {
  container: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    color: 'white',
    boxSizing: 'border-box',
    width: '100%',
    minHeight: '100vh',
    padding: '20px 24px',
  },
  header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  logo: {
    width: 48, height: 48,
    background: 'linear-gradient(135deg, #f7931a 0%, #ff6b00 100%)',
    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 24, fontWeight: 'bold',
  },
  title: { fontSize: 20, fontWeight: 600 },
  subtitle: { fontSize: 12, color: '#888' },
  card: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12, padding: 16, marginBottom: 14,
  },
  siteInfo: { textAlign: 'center' },
  siteIcon: {
    width: 48, height: 48, background: 'rgba(255,255,255,0.1)', borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
    margin: '0 auto 8px',
  },
  siteName: { fontSize: 18, fontWeight: 600, marginBottom: 4 },
  siteUrl: { fontSize: 14, color: '#f7931a' },
  message: { textAlign: 'center', fontSize: 14, color: '#aaa', marginBottom: 14 },
  txDetails: {
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13,
  },
  txRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0' },
  txLabel: { color: '#888' },
  txValue: { color: '#fff', fontFamily: 'monospace' },
  outputList: { marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 },
  outputItem: { display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 },
  outputAddr: { color: '#888', fontFamily: 'monospace' },
  outputValue: { color: '#ccc', fontFamily: 'monospace' },
  error: {
    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: '#ef4444',
  },
  loading: { textAlign: 'center', color: '#888', padding: 40 },
  buttons: { display: 'flex', gap: 12 },
  passwordInput: {
    width: '100%', padding: '12px 14px', marginBottom: 12, boxSizing: 'border-box',
    borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', fontSize: 15,
    background: 'rgba(0,0,0,0.35)', color: 'white', outline: 'none',
  },
  btnCancel: {
    flex: 1, padding: 12, border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600,
    cursor: 'pointer', background: 'rgba(255,255,255,0.1)', color: 'white',
  },
  btnSign: {
    flex: 1, padding: 12, border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600,
    cursor: 'pointer', background: 'linear-gradient(135deg, #f7931a 0%, #ff6b00 100%)', color: 'white',
  },
  btnSignDisabled: {
    flex: 1, padding: 12, border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600,
    cursor: 'not-allowed', background: '#555', color: '#999',
  },
};

// Mount React app
const root = createRoot(document.getElementById('root'));
root.render(<SignApproval />);
