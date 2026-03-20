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

function getBip86Path(networkName) {
  return networkName === 'mainnet' ? "m/86'/0'/0'" : "m/86'/1'/0'";
}

function getBip84Path(networkName) {
  return networkName === 'mainnet' ? "m/84'/0'/0'" : "m/84'/1'/0'";
}

function isP2wpkhAddress(addr) {
  return addr.startsWith('bc1q') || addr.startsWith('tb1q');
}

/**
 * Derive all key pairs from seed phrase for a given network.
 * Returns a Map of address → { privateKey, publicKey, xOnlyPubKey?, type, index, isChange }
 * type: 'p2wpkh' | 'p2tr'
 */
async function deriveKeyMap(seedPhrase, networkName, addresses) {
  const network = getNetworkConfig(networkName);
  const seed = await bip39.mnemonicToSeed(seedPhrase);
  const root = bip32.fromSeed(seed, network);

  // BIP86 (P2TR) nodes
  const bip86Account = root.derivePath(getBip86Path(networkName));
  const bip86Receive = bip86Account.derive(0);
  const bip86Change = bip86Account.derive(1);

  // BIP84 (P2WPKH) nodes
  const bip84Account = root.derivePath(getBip84Path(networkName));
  const bip84Receive = bip84Account.derive(0);

  const keyMap = new Map();

  for (const addrObj of addresses) {
    const addr = addrObj.address || addrObj;
    const index = addrObj.index ?? 0;
    const isChange = addrObj.isChange ?? false;

    if (isP2wpkhAddress(addr)) {
      // BIP84 P2WPKH — only receive chain index 0 for now
      const child = bip84Receive.derive(index);
      const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: child.publicKey, network });
      if (p2wpkh.address === addr) {
        keyMap.set(addr, {
          privateKey: child.privateKey,
          publicKey: child.publicKey,  // full 33-byte compressed
          type: 'p2wpkh',
          index,
          isChange,
        });
      }
    } else {
      // BIP86 P2TR
      const chain = isChange ? bip86Change : bip86Receive;
      const child = chain.derive(index);
      const xOnlyPubKey = Buffer.from(child.publicKey.slice(1, 33));
      const p2tr = bitcoin.payments.p2tr({ internalPubkey: xOnlyPubKey, network });
      if (p2tr.address === addr) {
        keyMap.set(addr, {
          privateKey: child.privateKey,
          publicKey: child.publicKey,
          xOnlyPubKey,
          type: 'p2tr',
          index,
          isChange,
        });
      }
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

      if (keyInfo) {
        signInputByType(psbt, index, keyInfo, network);
        signedCount++;
      } else {
        // Fallback: match by scriptPubKey
        const found = matchAndSignInput(psbt, index, keyMap, network);
        if (found) {
          signedCount++;
        } else {
          throw new Error(`No key found for input ${index} (address: ${address})`);
        }
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

      const found = matchAndSignInput(psbt, i, keyMap, network);
      if (found) signedCount++;
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
 * Route signing to the correct method based on key type or script detection.
 */
function signInputByType(psbt, inputIndex, keyInfo, network) {
  if (keyInfo.type === 'p2wpkh') {
    signP2wpkhInput(psbt, inputIndex, keyInfo, network);
  } else {
    signTaprootInput(psbt, inputIndex, keyInfo, network);
  }
}

/**
 * Try to match an input's scriptPubKey against all keys in the keyMap and sign.
 * Returns true if matched and signed.
 */
function matchAndSignInput(psbt, inputIndex, keyMap, network) {
  const inputData = psbt.data.inputs[inputIndex];
  if (!inputData?.witnessUtxo) return false;
  const scriptHex = Buffer.from(inputData.witnessUtxo.script).toString('hex');

  for (const [addr, keyInfo] of keyMap.entries()) {
    try {
      if (keyInfo.type === 'p2wpkh') {
        // P2WPKH scriptPubKey: 0014<20-byte-hash>
        const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: keyInfo.publicKey, network });
        if (p2wpkh.output.toString('hex') === scriptHex) {
          console.log(`[approve-sign] input ${inputIndex}: MATCHED P2WPKH addr=${addr}`);
          signP2wpkhInput(psbt, inputIndex, keyInfo, network);
          return true;
        }
      } else {
        // P2TR scriptPubKey: 5120<32-byte-xonly>
        const p2tr = bitcoin.payments.p2tr({ internalPubkey: keyInfo.xOnlyPubKey, network });
        if (p2tr.output.toString('hex') === scriptHex) {
          console.log(`[approve-sign] input ${inputIndex}: MATCHED P2TR addr=${addr}`);
          signTaprootInput(psbt, inputIndex, keyInfo, network);
          return true;
        }
      }
    } catch { /* continue */ }
  }
  return false;
}

/**
 * Sign a single P2WPKH input with ECDSA.
 *
 * BIP141 witness v0 signing:
 *   1. Build scriptCode = P2PKH-style script from the P2WPKH hash.
 *   2. Compute sighash via hashForWitnessV0 on the unsigned transaction.
 *   3. Sign with ECDSA and set partialSig on the PSBT input.
 */
function signP2wpkhInput(psbt, inputIndex, keyInfo, network) {
  const { privateKey, publicKey } = keyInfo;

  console.log(`[signP2wpkhInput] input=${inputIndex}, pubkey=${Buffer.from(publicKey).toString('hex').slice(0,16)}...`);

  // Build scriptCode: OP_DUP OP_HASH160 <20-byte-hash> OP_EQUALVERIFY OP_CHECKSIG
  const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: publicKey, network });
  const scriptCode = bitcoin.payments.p2pkh({ hash: p2wpkh.hash, network }).output;

  // Get value from witnessUtxo
  const value = psbt.data.inputs[inputIndex].witnessUtxo.value;

  // Compute sighash for witness v0
  const tx = psbt.__CACHE.__TX;
  const sighash = tx.hashForWitnessV0(
    inputIndex,
    scriptCode,
    typeof value === 'bigint' ? value : BigInt(value),
    bitcoin.Transaction.SIGHASH_ALL,
  );

  // Sign with ECDSA
  const sig = ecc.sign(sighash, privateKey);

  // DER encode + sighash type byte
  const derSig = bitcoin.script.signature.encode(Buffer.from(sig), bitcoin.Transaction.SIGHASH_ALL);

  // Set partialSig on the PSBT input (ECDSA path)
  psbt.updateInput(inputIndex, {
    partialSig: [{ pubkey: publicKey, signature: derSig }],
  });

  console.log(`[signP2wpkhInput] input=${inputIndex}: signed OK`);
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

  // Prefer P2WPKH key for signing (CAST cancel requires P2WPKH signature)
  const p2wpkhKey = [...keyMap.values()].find(k => k.type === 'p2wpkh');
  const signingKeyInfo = p2wpkhKey || keyMap.values().next().value;
  if (!signingKeyInfo) throw new Error('No key available to sign message');

  const { privateKey, publicKey, type: keyType } = signingKeyInfo;

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

  if (keyType === 'p2wpkh') {
    // P2WPKH: sign with raw private key (no negation), header = 39 + recoveryId
    const sigRaw = ecc.sign(hash, privateKey);

    // Determine recovery ID by trying both 0 and 1
    let recoveryId = 0;
    for (let rid = 0; rid < 2; rid++) {
      const recovered = ecc.recover(hash, sigRaw, rid, true);
      if (recovered && Buffer.from(recovered).equals(Buffer.from(publicKey))) {
        recoveryId = rid;
        break;
      }
    }

    const header = 39 + recoveryId; // BIP137: P2WPKH compressed = 39-42
    const sigBuffer = Buffer.concat([Buffer.from([header]), sigRaw]);
    return sigBuffer.toString('base64');
  } else {
    // P2TR: existing Taproot signing — negate if odd Y, header 31
    const isOddY = publicKey[0] === 0x03;
    const signingKey = isOddY ? ecc.privateNegate(privateKey) : privateKey;
    const sigRaw = ecc.sign(hash, signingKey);
    const sigBuffer = Buffer.concat([Buffer.from([31]), sigRaw]);
    return sigBuffer.toString('base64');
  }
}

// ============================================================
// React UI Component
// ============================================================

// Storage keys (must match background.js / storage-keys.js)
const EXT_PENDING_SIGN = 'ext:pending_sign';
const EXT_PENDING_PROOF = 'ext:pending_proof';
const EXT_SIGN_RESPONSE = 'ext:sign_response';
const SK_SEED_PHRASE = 'wallet:seed_phrase';
const SK_ACTIVE_NETWORK = 'wallet:active_network';
const addrKey = (bc, net) => `wallet:${bc}:${net}:addresses`;

function shortenAddr(addr) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
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
      const storageData = await chrome.storage.local.get([SK_SEED_PHRASE, SK_ACTIVE_NETWORK, mainnetKey, testnetKey]);
      const seedPhrase = storageData[SK_SEED_PHRASE];
      if (!seedPhrase) throw new Error('Seed phrase not found in wallet');
      const networkName = storageData[SK_ACTIVE_NETWORK] || 'mainnet';
      let addresses = safeParse(storageData[addrKey('bitcoin', networkName)]);
      if (addresses.length === 0) {
        const fallback = networkName === 'mainnet' ? 'testnet4' : 'mainnet';
        addresses = safeParse(storageData[addrKey('bitcoin', fallback)]);
      }
      if (addresses.length === 0) throw new Error('No wallet addresses found');

      if (request.type === 'signMessage') {
        const signature = await signMessageWithKeys(request.message, seedPhrase, networkName, addresses);
        await chrome.storage.local.set({ [EXT_SIGN_RESPONSE]: { approved: true, requestId: request.id, signature } });
      } else {
        const signedPsbtHex = await signPsbtWithKeys(request.psbtHex, request.options, seedPhrase, networkName, addresses);
        await chrome.storage.local.set({ [EXT_SIGN_RESPONSE]: { approved: true, requestId: request.id, signedPsbtHex } });
      }
      await chrome.storage.local.remove(EXT_PENDING_SIGN);
      window.close();
    } catch (err) {
      console.error('[approve-sign] Signing error:', err);
      setError(err.message);
      setSigning(false);
    }
  };

  // ── Sign + broadcast: Charm transfer ─────────────────────────────────────────

  const handleSignCharm = async () => {
    setSigning(true);
    setError(null);
    try {
      const storageData = await chrome.storage.local.get([SK_SEED_PHRASE, SK_ACTIVE_NETWORK]);
      const seedPhrase = storageData[SK_SEED_PHRASE];
      if (!seedPhrase) throw new Error('Seed phrase not found in wallet');
      const network = pendingProof.meta?.network || storageData[SK_ACTIVE_NETWORK] || 'mainnet';

      const { signAndBroadcastTransfer } = await import('./services/charm-transfer/executor.js');
      const prevTxMap = new Map(pendingProof.prevTxMapEntries || []);
      const result = await signAndBroadcastTransfer({
        spellTxHex: pendingProof.spellTxHex,
        prevTxMap,
        inputSigningMap: pendingProof.meta?.inputSigningMap,
        seedPhrase,
        network,
        onStatus: () => {},
      });

      await chrome.storage.local.remove([EXT_PENDING_PROOF]);
      setTxid(result.txid);
    } catch (err) {
      console.error('[approve-sign] Charm sign error:', err);
      setError(err.message);
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

        <div style={styles.buttons}>
          <button style={styles.btnCancel} onClick={handleCancelCharm} disabled={signing}>Cancel</button>
          <button style={signing ? styles.btnSignDisabled : styles.btnSign} onClick={handleSignCharm} disabled={signing}>
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

      <div style={styles.buttons}>
        <button style={styles.btnCancel} onClick={handleCancelPsbt} disabled={signing}>Cancel</button>
        <button style={signing ? styles.btnSignDisabled : styles.btnSign} onClick={handleSignPsbt} disabled={signing}>
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
