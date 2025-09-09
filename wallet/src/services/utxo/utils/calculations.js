// UTXO Calculations - Fee calculations and utility functions

export class UTXOCalculations {
    // Calculate fee for a transaction with standard inputs
    calculateFee(inputCount, outputCount, feeRate = 1) {
        // Size estimation: Taproot inputs (57 bytes) + outputs (34 bytes) + overhead (10 bytes)
        const estimatedSize = (inputCount * 57) + (outputCount * 34) + 10;
        return Math.ceil(estimatedSize * feeRate);
    }

    // Calculate fee for a transaction with mixed input types
    calculateMixedFee(utxos, outputCount, feeRate = 1) {
        const inputSize = utxos.reduce((sum, utxo) => {
            // P2PKH (148 bytes) vs Taproot (57 bytes)
            const inputType = utxo.scriptPubKey?.startsWith('76a9') ? 148 : 57;
            return sum + inputType;
        }, 0);

        const estimatedSize = inputSize + (outputCount * 34) + 10;
        return Math.ceil(estimatedSize * feeRate);
    }

    // Convert satoshis to BTC
    satoshisToBtc(satoshis) {
        return satoshis / 100000000;
    }

    // Convert BTC to satoshis
    btcToSatoshis(btc) {
        return Math.floor(btc * 100000000);
    }

    // Format satoshis as BTC string with 8 decimal places
    formatSats(satoshis) {
        return this.satoshisToBtc(satoshis).toFixed(8);
    }

    // Calculate total balance from UTXO map
    calculateTotalBalance(utxoMap) {
        let total = 0;

        Object.values(utxoMap).forEach(utxos => {
            utxos.forEach(utxo => {
                total += utxo.value;
            });
        });

        return total;
    }

    // Calculate spendable balance from UTXO map (excludes Charm UTXOs and 1000 sat UTXOs)
    calculateSpendableBalance(utxoMap, charms = []) {
        let total = 0;
        let totalUtxos = 0;
        let excludedUtxos = 0;
        const charmUtxoIds = new Set();
        const processedUtxos = new Set();

        // Create set of charm UTXO IDs for faster lookup
        charms.forEach(charm => {
            if (charm.utxo) {
                const { txid, vout } = charm.utxo;
                const voutStr = vout?.toString() || '0';
                if (txid) {
                    const utxoId = `${txid}:${voutStr}`;
                    charmUtxoIds.add(utxoId);
                }
            }
        });

        console.log(`[BALANCE] Calculating spendable balance (excluding charms and 1000 sat UTXOs)`);

        Object.values(utxoMap).forEach(utxos => {
            utxos.forEach(utxo => {
                const utxoId = `${utxo.txid}:${utxo.vout}`;
                
                // Skip if already processed (avoid duplicates)
                if (processedUtxos.has(utxoId)) {
                    return;
                }
                processedUtxos.add(utxoId);
                totalUtxos++;
                
                const isCharm = charmUtxoIds.has(utxoId);
                const is1000Sats = utxo.value === 1000;
                
                if (isCharm || is1000Sats) {
                    excludedUtxos++;
                    if (isCharm) {
                        console.log(`[BALANCE] Excluded charm UTXO ${utxoId} (${utxo.value} sats)`);
                    } else if (is1000Sats) {
                        console.log(`[BALANCE] Excluded 1000 sat UTXO ${utxoId} (potential charm)`);
                    }
                } else {
                    total += utxo.value;
                    console.log(`[BALANCE] Spendable UTXO ${utxoId} (${utxo.value} sats)`);
                }
            });
        });

        console.log(`[BALANCE] Spendable total: ${total} sats from ${totalUtxos - excludedUtxos} UTXOs (excluded ${excludedUtxos})`);
        return total;
    }

    // Get list of spendable UTXOs (excluding charms and 1000 sat UTXOs)
    getSpendableUtxos(utxoMap, charms = []) {
        const spendableUtxos = [];
        const charmUtxoIds = new Set();
        const processedUtxos = new Set();

        // Create set of charm UTXO IDs
        charms.forEach(charm => {
            if (charm.utxo) {
                const { txid, vout } = charm.utxo;
                const voutStr = vout?.toString() || '0';
                if (txid) {
                    const utxoId = `${txid}:${voutStr}`;
                    charmUtxoIds.add(utxoId);
                }
            }
        });

        Object.values(utxoMap).forEach(utxos => {
            utxos.forEach(utxo => {
                const utxoId = `${utxo.txid}:${utxo.vout}`;
                
                // Skip if already processed (avoid duplicates)
                if (processedUtxos.has(utxoId)) {
                    return;
                }
                processedUtxos.add(utxoId);
                
                const isCharm = charmUtxoIds.has(utxoId);
                const is1000Sats = utxo.value === 1000;
                
                if (!isCharm && !is1000Sats) {
                    spendableUtxos.push(utxo);
                }
            });
        });

        return spendableUtxos;
    }

    // Find UTXOs by transaction ID
    findUtxosByTxid(utxoMap, txid) {
        const matchingUtxos = [];

        Object.entries(utxoMap).forEach(([address, utxos]) => {
            utxos.forEach(utxo => {
                if (utxo.txid === txid) {
                    matchingUtxos.push({
                        ...utxo,
                        address
                    });
                }
            });
        });

        return matchingUtxos;
    }
}

export const utxoCalculations = new UTXOCalculations();
export default utxoCalculations;
