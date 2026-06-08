// Fee math. `feeRate` is sat/vB and is REQUIRED — every caller must pass
// the value returned by `getNetworkFeeRate()` (the single source of truth).
// Taproot input ≈ 57 vbytes, P2PKH input ≈ 148, P2TR output ≈ 34, overhead 10.

export function calculateFee(inputCount, outputCount, feeRate) {
    if (!feeRate || feeRate <= 0) {
        throw new Error('calculateFee: feeRate is required (call getNetworkFeeRate first).');
    }
    const estimatedSize = (inputCount * 57) + (outputCount * 34) + 10;
    return Math.ceil(estimatedSize * feeRate);
}

export function calculateMixedFee(utxos, outputCount, feeRate) {
    if (!feeRate || feeRate <= 0) {
        throw new Error('calculateMixedFee: feeRate is required (call getNetworkFeeRate first).');
    }
    const inputSize = utxos.reduce((sum, utxo) => {
        const inputType = utxo.scriptPubKey?.startsWith('76a9') ? 148 : 57;
        return sum + inputType;
    }, 0);
    const estimatedSize = inputSize + (outputCount * 34) + 10;
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
