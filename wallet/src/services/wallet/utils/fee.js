// Calculate fee for a transaction
export function calculateFee(inputCount, outputCount, feeRate = 1) {
    // For Taproot:
    // - Each input ~57 bytes (with witness data)
    // - Each output ~34 bytes
    // - 10 bytes fixed overhead
    const estimatedSize = (inputCount * 57) + (outputCount * 34) + 10;
    return Math.ceil(estimatedSize * feeRate);
}

// Calculate fee for a transaction with mixed input types
export function calculateMixedFee(utxos, outputCount, feeRate = 1) {
    // Calculate size based on input types
    const inputSize = utxos.reduce((sum, utxo) => {
        // P2PKH inputs are larger than Taproot inputs
        const inputType = utxo.scriptPubKey?.startsWith('76a9') ? 148 : 57;
        return sum + inputType;
    }, 0);

    // Each output ~34 bytes + 10 bytes fixed overhead
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
