// Fee calculation utilities for Bitcoin transactions

// Calculate fee for a transaction with standard Taproot inputs
export function calculateFee(inputCount, outputCount, feeRate = 1) {
    // Size estimation: Taproot inputs (57 bytes) + outputs (34 bytes) + overhead (10 bytes)
    const estimatedSize = (inputCount * 57) + (outputCount * 34) + 10;
    return Math.ceil(estimatedSize * feeRate);
}

// Calculate fee for a transaction with mixed input types
export function calculateMixedFee(utxos, outputCount, feeRate = 1) {
    // Calculate size based on each input's script type
    const inputSize = utxos.reduce((sum, utxo) => {
        // P2PKH (148 bytes) vs Taproot (57 bytes)
        const inputType = utxo.scriptPubKey?.startsWith('76a9') ? 148 : 57;
        return sum + inputType;
    }, 0);

    // Add output size and transaction overhead
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

// Format satoshis as BTC string with 8 decimal places
export function formatSats(satoshis) {
    return satoshisToBtc(satoshis).toFixed(8);
}

export default {
    calculateFee,
    calculateMixedFee,
    satoshisToBtc,
    btcToSatoshis,
    formatSats
};
