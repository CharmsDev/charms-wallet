// Import polyfills first - MUST be before any other imports
import './polyfills.js';

/**
 * PSBT Signing Approval Page
 *
 * Separate Vite entry point with full crypto libraries
 * (bitcoinjs-lib, bip32, bip39, ecpair, tiny-secp256k1).
 *
 * Flow:
 * 1. background.js stores ext:pending_sign in chrome.storage.local
 * 2. This popup reads the request, displays TX details
 * 3. User approves → signs PSBT with derived private keys → stores ext:sign_response
 * 4. background.js polls for ext:sign_response → returns signed hex to dApp
 */

import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';

// Initialize crypto libraries
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);

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

// Network configurations
const MAINNET = bitcoin.networks.bitcoin;
const TESTNET = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'tb',
  bip32: { public: 0x043587cf, private: 0x04358394 },
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};

function getNetworkConfig(networkName) {
  return networkName === 'mainnet' ? MAINNET : TESTNET;
}

function getDerivationPath(networkName) {
  return networkName === 'mainnet' ? "m/86'/0'/0'" : "m/86'/1'/0'";
}

/**
 * Derive all key pairs from seed phrase for a given network.
 * Returns a Map of address → { privateKey, publicKey, xOnlyPubKey, index, isChange }
 */
async function deriveKeyMap(seedPhrase, networkName, addresses) {
  const network = getNetworkConfig(networkName);
  const seed = await bip39.mnemonicToSeed(seedPhrase);
  const root = bip32.fromSeed(seed, network);
  const basePath = getDerivationPath(networkName);
  const accountNode = root.derivePath(basePath);
  const receiveChain = accountNode.derive(0);
  const changeChain = accountNode.derive(1);

  const keyMap = new Map();

  // Derive keys for all known addresses
  for (const addrObj of addresses) {
    const addr = addrObj.address || addrObj;
    const index = addrObj.index ?? 0;
    const isChange = addrObj.isChange ?? false;
    const chain = isChange ? changeChain : receiveChain;
    const child = chain.derive(index);

    const xOnlyPubKey = Buffer.from(child.publicKey.slice(1, 33));
    const p2tr = bitcoin.payments.p2tr({ internalPubkey: xOnlyPubKey, network });

    if (p2tr.address === addr) {
      keyMap.set(addr, {
        privateKey: child.privateKey,
        publicKey: child.publicKey,
        xOnlyPubKey,
        index,
        isChange,
      });
    }
  }

  return keyMap;
}

/**
 * Sign a PSBT with the wallet's private keys.
 * Mirrors UniSat's signPsbt behavior.
 */
async function signPsbtWithKeys(psbtHex, options, seedPhrase, networkName, addresses) {
  const network = getNetworkConfig(networkName);
  const keyMap = await deriveKeyMap(seedPhrase, networkName, addresses);
  const psbt = bitcoin.Psbt.fromHex(psbtHex, { network });

  const autoFinalized = options?.autoFinalized !== false;
  const toSignInputs = options?.toSignInputs;

  console.log('[approve-sign] keyMap addresses:', Array.from(keyMap.keys()));
  console.log('[approve-sign] toSignInputs:', JSON.stringify(toSignInputs));
  console.log('[approve-sign] autoFinalized:', autoFinalized);
  console.log('[approve-sign] inputCount:', psbt.inputCount);

  let signedCount = 0;

  if (toSignInputs && toSignInputs.length > 0) {
    // Sign only specified inputs
    for (const inputSpec of toSignInputs) {
      const { index, address } = inputSpec;
      const keyInfo = address ? keyMap.get(address) : null;
      console.log(`[approve-sign] toSign input ${index}, address=${address}, keyFound=${!!keyInfo}`);

      if (!keyInfo) {
        // Try to find key by matching the input's witnessUtxo scriptPubKey
        let found = false;
        for (const [addr, ki] of keyMap.entries()) {
          try {
            const p2tr = bitcoin.payments.p2tr({ internalPubkey: ki.xOnlyPubKey, network });
            const inputData = psbt.data.inputs[index];
            if (inputData?.witnessUtxo) {
              const scriptHex = Buffer.from(inputData.witnessUtxo.script).toString('hex');
              const p2trScriptHex = p2tr.output.toString('hex');
              console.log(`[approve-sign] fallback match: addr=${addr}, script=${scriptHex.slice(0,20)}..., p2tr=${p2trScriptHex.slice(0,20)}..., match=${scriptHex === p2trScriptHex}`);
              if (scriptHex === p2trScriptHex) {
                signTaprootInput(psbt, index, ki, network);
                found = true;
                signedCount++;
                break;
              }
            }
          } catch { /* continue */ }
        }
        if (!found) {
          throw new Error(`No key found for input ${index} (address: ${address})`);
        }
      } else {
        signTaprootInput(psbt, index, keyInfo, network);
        signedCount++;
      }
    }
  } else {
    // Sign all inputs we have keys for
    for (let i = 0; i < psbt.inputCount; i++) {
      const inputData = psbt.data.inputs[i];
      if (!inputData?.witnessUtxo) {
        console.log(`[approve-sign] input ${i}: no witnessUtxo, skipping`);
        continue;
      }

      const scriptHex = Buffer.from(inputData.witnessUtxo.script).toString('hex');
      console.log(`[approve-sign] input ${i}: scriptPubKey=${scriptHex}`);

      for (const [addr, keyInfo] of keyMap.entries()) {
        try {
          const p2tr = bitcoin.payments.p2tr({ internalPubkey: keyInfo.xOnlyPubKey, network });
          const p2trScriptHex = p2tr.output.toString('hex');
          if (p2trScriptHex === scriptHex) {
            console.log(`[approve-sign] input ${i}: MATCHED addr=${addr}`);
            signTaprootInput(psbt, i, keyInfo, network);
            signedCount++;
            break;
          }
        } catch { /* continue */ }
      }
    }
  }

  console.log(`[approve-sign] Signed ${signedCount} inputs out of ${psbt.inputCount}`);

  if (autoFinalized) {
    for (let i = 0; i < psbt.inputCount; i++) {
      try {
        psbt.finalizeInput(i);
        console.log(`[approve-sign] finalizeInput(${i}): OK`);
      } catch (e) {
        console.warn(`[approve-sign] finalizeInput(${i}): FAILED -`, e.message);
      }
    }
  }

  return psbt.toHex();
}

/**
 * Sign a single Taproot input with a tweaked private key.
 *
 * Uses direct sighash computation + ecc.signSchnorr (same approach as the
 * wallet web app in signCommitTx.js / signSpellTx.js) instead of
 * psbt.signInput(), which has an internal pubkey comparison that can fail.
 *
 * BIP341 key-path signing:
 *   1. If the internal public key has odd Y → negate the private key first.
 *   2. Compute tweak = taggedHash('TapTweak', xOnlyPubKey).
 *   3. tweakedPriv = (possibly-negated) privKey + tweak.
 *   4. Compute sighash via hashForWitnessV1 on the unsigned transaction.
 *   5. Sign with ecc.signSchnorr and set tapKeySig on the PSBT input.
 */
function signTaprootInput(psbt, inputIndex, keyInfo, network) {
  const { privateKey, xOnlyPubKey } = keyInfo;

  console.log(`[signTaprootInput] input=${inputIndex}`);
  console.log(`[signTaprootInput] pubkey prefix=0x${keyInfo.publicKey[0].toString(16)}, xOnly=${Buffer.from(xOnlyPubKey).toString('hex').slice(0,16)}...`);

  // Ensure tapInternalKey is set
  const existingTIK = psbt.data.inputs[inputIndex].tapInternalKey;
  if (existingTIK) {
    console.log(`[signTaprootInput] tapInternalKey already set: ${Buffer.from(existingTIK).toString('hex').slice(0,16)}...`);
    console.log(`[signTaprootInput] matches our xOnly: ${Buffer.from(existingTIK).toString('hex') === Buffer.from(xOnlyPubKey).toString('hex')}`);
  } else {
    psbt.updateInput(inputIndex, { tapInternalKey: xOnlyPubKey });
    console.log(`[signTaprootInput] set tapInternalKey to our xOnly`);
  }

  // Step 1: Negate private key if the full internal public key has odd Y
  const isOddY = keyInfo.publicKey[0] === 0x03;
  console.log(`[signTaprootInput] isOddY=${isOddY}`);
  const tweakedPrivateKey = ecc.privateAdd(
    isOddY ? ecc.privateNegate(privateKey) : privateKey,
    bitcoin.crypto.taggedHash('TapTweak', xOnlyPubKey)
  );
  if (!tweakedPrivateKey) throw new Error('Tweak resulted in invalid private key');

  // Verify: tweaked pub should match the output key in the scriptPubKey
  const tweakedPub = ecc.pointFromScalar(tweakedPrivateKey);
  const tweakedXOnly = Buffer.from(tweakedPub.slice(1, 33)).toString('hex');
  const scriptPubKey = Buffer.from(psbt.data.inputs[inputIndex].witnessUtxo.script).toString('hex');
  const outputKeyFromScript = scriptPubKey.slice(4); // skip 5120
  console.log(`[signTaprootInput] tweakedXOnly=${tweakedXOnly.slice(0,16)}...`);
  console.log(`[signTaprootInput] outputKey   =${outputKeyFromScript.slice(0,16)}...`);
  console.log(`[signTaprootInput] MATCH=${tweakedXOnly === outputKeyFromScript}`);
  if (tweakedXOnly !== outputKeyFromScript) {
    console.error(`[signTaprootInput] ⚠️ MISMATCH! Tweaked key does not match output key. Signature will be invalid.`);
  }

  // Step 2: Collect prevOutScripts and values for ALL inputs (required by BIP341)
  const prevOutScripts = [];
  const values = [];
  for (let i = 0; i < psbt.data.inputs.length; i++) {
    const input = psbt.data.inputs[i];
    if (input.witnessUtxo) {
      prevOutScripts.push(input.witnessUtxo.script);
      values.push(input.witnessUtxo.value);
    } else {
      throw new Error(`Input ${i} missing witnessUtxo — cannot compute Taproot sighash`);
    }
  }

  // Step 3: Compute sighash directly from the unsigned transaction
  const tx = psbt.__CACHE.__TX;
  const sighashType = psbt.data.inputs[inputIndex].sighashType || bitcoin.Transaction.SIGHASH_DEFAULT;
  const sighash = tx.hashForWitnessV1(
    inputIndex,
    prevOutScripts,
    values,
    sighashType,
  );

  // Step 4: Sign with Schnorr
  const sig = Buffer.from(ecc.signSchnorr(sighash, tweakedPrivateKey));

  // Step 5: Set tapKeySig on the PSBT input (append sighashType byte if non-default)
  const tapKeySig = sighashType
    ? Buffer.concat([sig, Buffer.from([sighashType])])
    : sig;
  psbt.data.updateInput(inputIndex, { tapKeySig });
}

/**
 * Sign a Bitcoin message with the wallet's private key.
 * Format: Bitcoin Signed Message (BIP137/Electrum-compatible).
 * Returns base64-encoded signature.
 */
async function signMessageWithKeys(message, seedPhrase, networkName, addresses) {
  const network = getNetworkConfig(networkName);
  const keyMap = await deriveKeyMap(seedPhrase, networkName, addresses);

  // Use the first derived key (the active address)
  const firstKey = keyMap.values().next().value;
  if (!firstKey) throw new Error('No key available to sign message');

  const { privateKey, publicKey } = firstKey;

  // Bitcoin Signed Message hash: dSHA256(prefix + varint(len) + message)
  const prefix = '\x18Bitcoin Signed Message:\n';
  const msgBuffer = Buffer.from(message, 'utf8');
  const prefixBuffer = Buffer.from(prefix, 'utf8');

  function varIntBuffer(n) {
    if (n < 0xfd) return Buffer.from([n]);
    if (n <= 0xffff) { const b = Buffer.alloc(3); b[0] = 0xfd; b.writeUInt16LE(n, 1); return b; }
    const b = Buffer.alloc(5); b[0] = 0xfe; b.writeUInt32LE(n, 1); return b;
  }

  const payload = Buffer.concat([
    varIntBuffer(prefixBuffer.length), prefixBuffer,
    varIntBuffer(msgBuffer.length), msgBuffer
  ]);

  const hash = bitcoin.crypto.hash256(payload);

  // Determine if key needs negation (odd Y)
  const isOddY = publicKey[0] === 0x03;
  const signingKey = isOddY ? ecc.privateNegate(privateKey) : privateKey;

  // Sign with ECDSA (recoverable)
  const sigRaw = ecc.sign(hash, signingKey);

  // Build recoverable signature: 1 byte header + 32 bytes R + 32 bytes S
  // Header: 31 = uncompressed, 27+4 = compressed P2PKH, 39+4 = P2WPKH
  // For Taproot/P2TR addresses use header 31 (compressed + no recovery flag)
  const recoveryFlag = isOddY ? 0 : 0;
  const header = 31 + recoveryFlag; // 31 = compressed key, standard
  const sigBuffer = Buffer.concat([Buffer.from([header]), sigRaw]);

  return sigBuffer.toString('base64');
}

// ============================================================
// React UI Component
// ============================================================

// Storage keys (must match background.js / storage-keys.js)
const EXT_PENDING_SIGN = 'ext:pending_sign';
const EXT_SIGN_RESPONSE = 'ext:sign_response';
const SK_SEED_PHRASE = 'wallet:seed_phrase';
const SK_ACTIVE_NETWORK = 'wallet:active_network';
const addrKey = (bc, net) => `wallet:${bc}:${net}:addresses`;

function SignApproval() {
  const [request, setRequest] = useState(null);
  const [psbtInfo, setPsbtInfo] = useState(null);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const data = await chrome.storage.local.get([EXT_PENDING_SIGN]);
      const req = data[EXT_PENDING_SIGN];
      console.log('[approve-sign] Pending request:', req);

      if (!req) {
        setError('No pending sign request found');
        return;
      }
      setRequest(req);

      // Parse PSBT to show details
      try {
        const psbt = bitcoin.Psbt.fromHex(req.psbtHex);
        const inputCount = psbt.inputCount;
        const outputCount = psbt.txOutputs.length;

        let totalOutput = 0n;
        const outputs = psbt.txOutputs.map((out, i) => {
          totalOutput += BigInt(out.value);
          return {
            index: i,
            value: Number(out.value),
            address: out.address || '(script)',
          };
        });

        setPsbtInfo({ inputCount, outputCount, outputs, totalOutput: Number(totalOutput) });
      } catch (e) {
        console.warn('[approve-sign] Could not parse PSBT for display:', e);
        setPsbtInfo({ inputCount: '?', outputCount: '?', outputs: [], totalOutput: 0 });
      }
    })();
  }, []);

  const handleCancel = async () => {
    await chrome.storage.local.set({
      [EXT_SIGN_RESPONSE]: { approved: false, requestId: request.id, error: 'User rejected the signing request' }
    });
    await chrome.storage.local.remove(EXT_PENDING_SIGN);
    window.close();
  };

  const handleSign = async () => {
    setSigning(true);
    setError(null);

    try {
      const mainnetKey = addrKey('bitcoin', 'mainnet');
      const testnetKey = addrKey('bitcoin', 'testnet4');
      const storageData = await chrome.storage.local.get([
        SK_SEED_PHRASE,
        SK_ACTIVE_NETWORK,
        mainnetKey,
        testnetKey,
      ]);

      const seedPhrase = storageData[SK_SEED_PHRASE];
      if (!seedPhrase) throw new Error('Seed phrase not found in wallet');

      const networkName = storageData[SK_ACTIVE_NETWORK] || 'mainnet';
      const activeAddrKey = addrKey('bitcoin', networkName);
      let addresses = safeParse(storageData[activeAddrKey]);

      if (addresses.length === 0) {
        const fallbackNetwork = networkName === 'mainnet' ? 'testnet4' : 'mainnet';
        addresses = safeParse(storageData[addrKey('bitcoin', fallbackNetwork)]);
      }

      if (addresses.length === 0) throw new Error('No wallet addresses found');

      if (request.type === 'signMessage') {
        // Sign message
        console.log('[approve-sign] Signing message:', request.message);
        const signature = await signMessageWithKeys(request.message, seedPhrase, networkName, addresses);
        console.log('[approve-sign] Message signed successfully');
        await chrome.storage.local.set({
          [EXT_SIGN_RESPONSE]: { approved: true, requestId: request.id, signature }
        });
      } else {
        // Sign PSBT
        console.log('[approve-sign] Signing PSBT with', addresses.length, 'addresses on', networkName);
        const signedPsbtHex = await signPsbtWithKeys(request.psbtHex, request.options, seedPhrase, networkName, addresses);
        console.log('[approve-sign] PSBT signed successfully');
        await chrome.storage.local.set({
          [EXT_SIGN_RESPONSE]: { approved: true, requestId: request.id, signedPsbtHex }
        });
      }

      await chrome.storage.local.remove(EXT_PENDING_SIGN);
      window.close();
    } catch (err) {
      console.error('[approve-sign] Signing error:', err);
      setError(err.message);
      setSigning(false);
    }
  };

  if (!request) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.logo}>₿</div>
          <div>
            <div style={styles.title}>Charms Wallet</div>
            <div style={styles.subtitle}>Sign Transaction</div>
          </div>
        </div>
        {error ? (
          <div style={styles.error}>{error}</div>
        ) : (
          <div style={styles.loading}>Loading...</div>
        )}
      </div>
    );
  }

  const url = (() => {
    try { return new URL(request.origin); } catch { return { hostname: 'Unknown', origin: request.origin }; }
  })();

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.logo}>₿</div>
        <div>
          <div style={styles.title}>Charms Wallet</div>
          <div style={styles.subtitle}>Sign Transaction</div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.siteInfo}>
          <div style={styles.siteIcon}>🔏</div>
          <div style={styles.siteName}>{url.hostname}</div>
          <div style={styles.siteUrl}>{request.origin}</div>
        </div>
      </div>

      <div style={styles.message}>
        {request.type === 'signMessage' ? 'This site wants you to sign a message' : 'This site wants you to sign a transaction'}
      </div>

      {request.type === 'signMessage' && (
        <div style={styles.txDetails}>
          <div style={styles.txRow}>
            <span style={styles.txLabel}>Message</span>
          </div>
          <div style={{ ...styles.txRow, wordBreak: 'break-all', fontSize: '12px', color: '#94a3b8' }}>
            {request.message}
          </div>
        </div>
      )}

      {!request.type && psbtInfo && (
        <div style={styles.txDetails}>
          <div style={styles.txRow}>
            <span style={styles.txLabel}>Inputs</span>
            <span style={styles.txValue}>{psbtInfo.inputCount}</span>
          </div>
          <div style={styles.txRow}>
            <span style={styles.txLabel}>Outputs</span>
            <span style={styles.txValue}>{psbtInfo.outputCount}</span>
          </div>
          <div style={styles.txRow}>
            <span style={styles.txLabel}>Total Output</span>
            <span style={styles.txValue}>{(psbtInfo.totalOutput / 100_000_000).toFixed(8)} BTC</span>
          </div>
          {psbtInfo.outputs.length > 0 && psbtInfo.outputs.length <= 6 && (
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

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.buttons}>
        <button style={styles.btnCancel} onClick={handleCancel} disabled={signing}>
          Cancel
        </button>
        <button style={signing ? styles.btnSignDisabled : styles.btnSign} onClick={handleSign} disabled={signing}>
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
    width: 360,
    minHeight: 400,
    padding: 20,
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
