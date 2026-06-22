// Fee math. `feeRate` is sat/vB and is REQUIRED — every caller must pass
// the value returned by `getNetworkFeeRate()` (the single source of truth).
//
// vbyte budgets per input / output type (rounded up to whole vbytes):
//   input  P2PKH       148
//          P2SH-P2WPKH  91
//          P2WPKH       68
//          P2WSH       104
//          P2TR         58
//   output P2PKH        34
//          P2SH         32
//          P2WPKH       31
//          P2WSH        43
//          P2TR         43
// Tx overhead: 10 vbytes (version + locktime + 2 segwit markers).

function vbytesPerInput(utxo) {
    const sp = utxo?.scriptPubKey || '';
    if (sp.startsWith('5120')) return 58;
    if (sp.startsWith('0014')) return 68;
    if (sp.startsWith('0020')) return 104;
    if (sp.startsWith('76a9')) return 148;
    if (sp.startsWith('a914')) return 91;
    const a = utxo?.address || '';
    if (a.startsWith('bc1p') || a.startsWith('tb1p') || a.startsWith('bcrt1p')) return 58;
    if (a.startsWith('bc1q') || a.startsWith('tb1q') || a.startsWith('bcrt1q')) {
        return a.length > 50 ? 104 : 68;
    }
    if (/^[1mn]/.test(a)) return 148;
    if (/^[23]/.test(a)) return 91;
    // Unknown shape: assume P2WPKH, the most common segwit case. The
    // previous default was 57 (taproot) which under-counts every native
    // segwit input by 11 vbytes and bit the Send-Max calc in production.
    return 68;
}

function vbytesPerOutput(addr) {
    if (!addr) return 43;
    const a = String(addr);
    if (a.startsWith('bc1p') || a.startsWith('tb1p') || a.startsWith('bcrt1p')) return 43;
    if (a.startsWith('bc1q') || a.startsWith('tb1q') || a.startsWith('bcrt1q')) {
        return a.length > 50 ? 43 : 31;
    }
    if (/^[1mn]/.test(a)) return 34;
    if (/^[23]/.test(a)) return 32;
    return 43;
}

export function calculateFee(inputCount, outputCount, feeRate) {
    if (!feeRate || feeRate <= 0) {
        throw new Error('calculateFee: feeRate is required (call getNetworkFeeRate first).');
    }
    // Conservative defaults: P2WPKH input (68), P2TR output (43).
    const estimatedSize = (inputCount * 68) + (outputCount * 43) + 10;
    return Math.ceil(estimatedSize * feeRate);
}

/**
 * outputs accepts either a number (legacy: assume worst-case 43 vbytes
 * each) or an array of strings/objects whose `address` field is used
 * for per-output sizing.
 */
export function calculateMixedFee(utxos, outputs, feeRate) {
    if (!feeRate || feeRate <= 0) {
        throw new Error('calculateMixedFee: feeRate is required (call getNetworkFeeRate first).');
    }
    const inputSize = utxos.reduce((sum, utxo) => sum + vbytesPerInput(utxo), 0);
    let outputSize;
    if (Array.isArray(outputs)) {
        outputSize = outputs.reduce((sum, o) => {
            const addr = typeof o === 'string' ? o : (o?.address || '');
            return sum + vbytesPerOutput(addr);
        }, 0);
    } else {
        const count = Number(outputs) || 0;
        outputSize = count * 43;
    }
    const estimatedSize = inputSize + outputSize + 10;
    return Math.ceil(estimatedSize * feeRate);
}

// Convert satoshis to BTC
export function satoshisToBtc(satoshis) {
    return satoshis / 100000000;
}

// Convert BTC to satoshis
export function btcToSatoshis(btc) {
    return Math.floor(btc * 100000000);
}

export default {
    calculateFee,
    calculateMixedFee,
    satoshisToBtc,
    btcToSatoshis
};
