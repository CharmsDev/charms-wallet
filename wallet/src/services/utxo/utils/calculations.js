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

    // Calculate spendable balance from UTXO map (excludes Charm UTXOs)
    calculateSpendableBalance(utxoMap, charms = []) {
        let total = 0;
        let totalUtxos = 0;
        let excludedUtxos = 0;

        // Create a set of UTXO identifiers ("txid:vout") that contain Charms
        const charmUtxoIds = new Set();
        charms.forEach((charm, index) => {
            const uid = charm?.uniqueId;
            if (!uid || typeof uid !== 'string') {
                return;
            }

            // Case 1: already in format 'txid:vout'
            if (/^[0-9a-fA-F]+:\d+$/.test(uid)) {
                charmUtxoIds.add(uid);
                return;
            }

            // Case 2: new format '<txid>-t/.../...-<vout>'
            // Capture txid before '-t/' and vout after last '-'
            const match = uid.match(/^([^\/-]+)-t\/.*-(\d+)$/);
            if (match) {
                const txid = match[1];
                const vout = match[2];
                const utxoId = `${txid}:${vout}`;
                charmUtxoIds.add(utxoId);
                return;
            }

            // Fallback: attempt to slice by '-t/' and last '-' without regex strictness
            const tIdx = uid.indexOf('-t/');
            const lastDash = uid.lastIndexOf('-');
            if (tIdx > 0 && lastDash > tIdx + 2) {
                const txid = uid.slice(0, tIdx);
                const voutStr = uid.slice(lastDash + 1);
                if (/^\d+$/.test(voutStr)) {
                    const utxoId = `${txid}:${voutStr}`;
                    charmUtxoIds.add(utxoId);
                    return;
                }
            }
        });

        console.log(`[BALANCE] Listing spendable UTXOs only`);

        Object.values(utxoMap).forEach(utxos => {
            utxos.forEach(utxo => {
                totalUtxos++;
                const utxoId = `${utxo.txid}:${utxo.vout}`;
                
                if (charmUtxoIds.has(utxoId)) {
                    excludedUtxos++;
                } else {
                    total += utxo.value;
                    console.log(`[BALANCE] Spendable UTXO ${utxoId} (${utxo.value} sats)`);
                }
            });
        });

        console.log(`[BALANCE] Spendable total: ${total} sats from ${totalUtxos - excludedUtxos} UTXOs (excluded ${excludedUtxos})`);
        return total;
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
