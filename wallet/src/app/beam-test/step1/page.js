'use client';

/**
 * Step 1 Test: Create Cardano placeholder UTXO.
 * URL: /beam-test/step1
 *
 * Reads config from localStorage (beam_test_context).
 * Creates the placeholder, shows all debug output.
 * Saves result (txHash, outputIndex) back to localStorage.
 */

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'beam_test_context';

function loadCtx() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function saveCtx(updates) {
  const ctx = { ...loadCtx(), ...updates };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  return ctx;
}

export default function Step1Test() {
  const [ctx, setCtx] = useState({});
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { setCtx(loadCtx()); }, []);

  const log = (msg, data) => {
    const entry = { time: new Date().toISOString().slice(11, 23), msg, data };
    setLogs(prev => [...prev, entry]);
    console.log(`[Step1] ${msg}`, data ?? '');
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setLogs([]);

    try {
      const { seedPhrase, cardanoAddress } = ctx;
      if (!seedPhrase) throw new Error('No seed phrase in config');
      if (!cardanoAddress) throw new Error('No Cardano address in config');

      log('Loading CSL (asmjs)...');
      const { waitForCardanoWasm, getCardanoWasm } = await import('@/lib/cardano/cardanoWasm');
      await waitForCardanoWasm();
      const CSL = getCardanoWasm();
      log('CSL loaded', { version: typeof CSL.TransactionBuilder });

      log('Deriving payment key...');
      const { seedPhraseToRootKey, derivePaymentKey } = await import('@/lib/cardano/wallet');
      const rootKey = await seedPhraseToRootKey(seedPhrase);
      const paymentKey = await derivePaymentKey(rootKey, 0);
      log('Payment key derived');

      log('Fetching UTXOs...', { address: cardanoAddress.slice(0, 20) + '...' });
      const { fetchUtxos } = await import('@/services/cardano/api');
      const utxos = await fetchUtxos(cardanoAddress);
      log('UTXOs fetched', { count: utxos.length, utxos: utxos.map(u => ({ txHash: u.txHash?.slice(0, 12), lovelace: u.lovelace })) });

      if (!utxos.length) throw new Error('No UTXOs found on Cardano address');

      log('Fetching protocol params...');
      const { getProtocolParams } = await import('@/services/cardano/api');
      const params = await getProtocolParams();
      log('Protocol params', { min_fee_a: params.min_fee_a, min_fee_b: params.min_fee_b, coins_per_utxo_size: params.coins_per_utxo_size });

      // Select largest UTXO
      const sorted = [...utxos].sort((a, b) => BigInt(b.lovelace || '0') > BigInt(a.lovelace || '0') ? 1 : -1);
      const funding = sorted[0];
      const fundingLovelace = BigInt(funding.lovelace || '0');
      log('Selected funding UTXO', { txHash: funding.txHash, outputIndex: funding.outputIndex, lovelace: funding.lovelace });

      const minUtxo = params.coins_per_utxo_size ? String(parseInt(params.coins_per_utxo_size) * 300) : '1000000';
      log('Min UTXO value', { minUtxo });

      log('Building transaction...');
      const txBuilder = CSL.TransactionBuilder.new(
        CSL.TransactionBuilderConfigBuilder.new()
          .fee_algo(CSL.LinearFee.new(
            CSL.BigNum.from_str(String(params.min_fee_a || '44')),
            CSL.BigNum.from_str(String(params.min_fee_b || '155381')),
          ))
          .pool_deposit(CSL.BigNum.from_str(String(params.pool_deposit || '500000000')))
          .key_deposit(CSL.BigNum.from_str(String(params.key_deposit || '2000000')))
          .coins_per_utxo_byte(CSL.BigNum.from_str(String(params.coins_per_utxo_size || '4310')))
          .max_tx_size(parseInt(params.max_tx_size) || 16384)
          .max_value_size(parseInt(params.max_val_size) || 5000)
          .build()
      );
      log('TransactionBuilder created');

      // Add input
      const inputTxHash = CSL.TransactionHash.from_hex(funding.txHash);
      const input = CSL.TransactionInput.new(inputTxHash, funding.outputIndex);
      log('Adding input...', { method: 'add_regular_input' });
      txBuilder.add_regular_input(
        CSL.Address.from_bech32(cardanoAddress),
        input,
        CSL.Value.new(CSL.BigNum.from_str(fundingLovelace.toString()))
      );
      log('Input added');

      // Add placeholder output
      const destAddr = CSL.Address.from_bech32(cardanoAddress);
      txBuilder.add_output(
        CSL.TransactionOutput.new(destAddr, CSL.Value.new(CSL.BigNum.from_str(minUtxo)))
      );
      log('Placeholder output added', { value: minUtxo });

      // Change
      const changeAdded = txBuilder.add_change_if_needed(destAddr);
      log('Change', { added: changeAdded });

      // Build
      const txBody = txBuilder.build();
      const txHash = CSL.hash_transaction(txBody);
      log('Transaction built', { hash: txHash.to_hex() });

      // Sign
      log('Signing...');
      const privateKey = paymentKey.to_raw_key();
      const witnesses = CSL.TransactionWitnessSet.new();
      const vkeyWitnesses = CSL.Vkeywitnesses.new();
      vkeyWitnesses.add(CSL.make_vkey_witness(txHash, privateKey));
      witnesses.set_vkeys(vkeyWitnesses);
      const signedTx = CSL.Transaction.new(txBody, witnesses);
      const txBytes = signedTx.to_bytes();
      log('Signed', { size: txBytes.length, hex: Array.from(txBytes.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join('') + '...' });

      // Submit
      log('Submitting to Cardano...');
      const { submitCardanoTx } = await import('@/services/cardano/api');
      const submittedHash = await submitCardanoTx(txBytes);
      const finalHash = typeof submittedHash === 'string' ? submittedHash : txHash.to_hex();
      log('SUBMITTED!', { txHash: finalHash });

      // Save result
      const res = { placeholderTxHash: finalHash, placeholderOutputIndex: 0 };
      saveCtx(res);
      setResult(res);
      setCtx(prev => ({ ...prev, ...res }));

    } catch (err) {
      log('ERROR', { message: err.message, stack: err.stack?.split('\n').slice(0, 3) });
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <a href="/beam-test" className="text-gray-500 hover:text-white text-sm">← Dashboard</a>
        <h1 className="text-xl font-bold">Step 1: Create Cardano Placeholder</h1>
      </div>

      {/* Config summary */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 mb-4 text-xs font-mono space-y-1">
        <div className="text-gray-500">Cardano Address: <span className="text-gray-300">{ctx.cardanoAddress?.slice(0, 30) || 'NOT SET'}...</span></div>
        <div className="text-gray-500">Seed: <span className="text-gray-300">{ctx.seedPhrase ? `${ctx.seedPhrase.split(' ').length} words` : 'NOT SET'}</span></div>
        <div className="text-gray-500">Network: <span className="text-gray-300">{ctx.adaNetwork || 'mainnet'}</span></div>
      </div>

      {/* Run button */}
      <button
        onClick={run}
        disabled={running || !ctx.seedPhrase || !ctx.cardanoAddress}
        className={`w-full py-3 rounded-lg font-medium text-sm mb-4 ${
          running ? 'bg-gray-700 text-gray-400' :
          !ctx.seedPhrase || !ctx.cardanoAddress ? 'bg-gray-800 text-gray-600' :
          'bg-purple-600 hover:bg-purple-700 text-white'
        }`}
      >
        {running ? 'Running...' : 'Run Step 1: Create Placeholder'}
      </button>

      {/* Result */}
      {result && (
        <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3 mb-4 text-sm">
          <div className="text-green-400 font-bold mb-1">Success!</div>
          <div className="text-green-300 font-mono text-xs">txHash: {result.placeholderTxHash}</div>
          <div className="text-green-300 font-mono text-xs">outputIndex: {result.placeholderOutputIndex}</div>
          <a
            href={`https://adastat.net/transactions/${result.placeholderTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 text-xs hover:underline mt-1 inline-block"
          >
            View on explorer →
          </a>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 mb-4 text-sm">
          <div className="text-red-400 font-bold mb-1">Error</div>
          <div className="text-red-300 text-xs">{error}</div>
        </div>
      )}

      {/* Logs */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
        <div className="text-xs font-bold text-gray-400 mb-2">Debug Log ({logs.length} entries)</div>
        <div className="space-y-1 max-h-[500px] overflow-y-auto font-mono text-xs">
          {logs.map((l, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-gray-600 flex-shrink-0">{l.time}</span>
              <span className={l.msg === 'ERROR' ? 'text-red-400' : l.msg.includes('SUBMITTED') ? 'text-green-400' : 'text-gray-300'}>{l.msg}</span>
              {l.data && <span className="text-gray-500 truncate">{JSON.stringify(l.data)}</span>}
            </div>
          ))}
          {logs.length === 0 && <div className="text-gray-700">No logs yet. Click Run to start.</div>}
        </div>
      </div>
    </div>
  );
}
