// bitcoin-scure-signer.js - Isolated Bitcoin signing service using @scure/btc-signer
import * as btc from '@scure/btc-signer';
import { hex } from '@scure/base';
import { mnemonicToSeed } from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import { getSeedPhrase, getAddresses } from '@/services/storage';

/**
 * Bitcoin Scure Signer Service
 * Isolated service for Bitcoin transaction signing using @scure/btc-signer
 * This service is specifically for Bitcoin sending functionality and is separate
 * from other signing services in the wallet (like Charms signing)
 */
class BitcoinScureSigner {
    constructor() {
        // Network configuration
        this.networks = {
            mainnet: btc.NETWORK,
            testnet: btc.TEST_NETWORK,
            regtest: btc.TEST_NETWORK // Use testnet config for regtest
        };
        
        // Default to testnet
        this.currentNetwork = this.networks.testnet;
    }

    /**
     * Determine network based on addresses in wallet
     */
    async determineNetwork() {
        try {
            const addresses = await getAddresses();
            
            // Check for regtest addresses
            const hasRegtestAddress = addresses.some(addr => addr.address.startsWith('bcrt'));
            
            if (hasRegtestAddress) {
                console.log('[BitcoinScureSigner] Using regtest/testnet network');
                this.currentNetwork = this.networks.regtest;
                return 'regtest';
            } else {
                console.log('[BitcoinScureSigner] Using testnet network');
                this.currentNetwork = this.networks.testnet;
                return 'testnet';
            }
        } catch (error) {
            console.warn('[BitcoinScureSigner] Could not determine network, defaulting to testnet:', error);
            this.currentNetwork = this.networks.testnet;
            return 'testnet';
        }
    }

    /**
     * Derive Taproot keys for a given derivation path
     */
    async deriveTaprootKeys(mnemonic, derivationPath = "m/86'/0'/0'/0/0") {
        try {
            console.log('[BitcoinScureSigner] Deriving keys for path:', derivationPath);
            
            const seed = await mnemonicToSeed(mnemonic);
            const hdkey = HDKey.fromMasterSeed(seed);
            
            // Derive the key for the given path
            const derivedKey = hdkey.derive(derivationPath);
            
            if (!derivedKey.privateKey) {
                throw new Error('Failed to derive private key');
            }

            // Create x-only pubkey (32 bytes) for Taproot
            const xOnlyPubkey = derivedKey.publicKey.slice(1); // Remove 0x02/0x03 prefix
            
            // Create Taproot payment
            const p2tr = btc.p2tr(xOnlyPubkey, undefined, this.currentNetwork);

            console.log('[BitcoinScureSigner] Keys derived successfully');
            console.log('[BitcoinScureSigner] Address:', p2tr.address);

            return {
                privateKey: derivedKey.privateKey,
                publicKey: derivedKey.publicKey,
                xOnlyPubkey,
                p2tr,
                address: p2tr.address
            };
        } catch (error) {
            console.error('[BitcoinScureSigner] Error deriving keys:', error);
            throw new Error(`Failed to derive Taproot keys: ${error.message}`);
        }
    }

    /**
     * Create and sign a Bitcoin transaction using PSBT approach
     */
    async createAndSignTransaction(transactionData, logCallback = null) {
        const log = (message) => {
            if (logCallback) logCallback(message);
            console.log('[BitcoinScureSigner]', message);
        };

        try {
            log('Starting Bitcoin transaction creation and signing...');
            
            // Determine network
            await this.determineNetwork();
            
            // Get seed phrase
            const seedPhrase = await getSeedPhrase();
            if (!seedPhrase) {
                throw new Error('Seed phrase not found in storage');
            }

            // Validate transaction data
            if (!transactionData.utxos || !Array.isArray(transactionData.utxos) || transactionData.utxos.length === 0) {
                throw new Error('No UTXOs provided for transaction');
            }

            if (!transactionData.destinationAddress) {
                throw new Error('Destination address is required');
            }

            if (!transactionData.amount || transactionData.amount <= 0) {
                throw new Error('Valid amount is required');
            }

            log(`Creating transaction: ${transactionData.amount} BTC to ${transactionData.destinationAddress}`);
            log(`Using ${transactionData.utxos.length} UTXOs`);

            // Create transaction using @scure/btc-signer
            const tx = new btc.Transaction({ allowUnknownOutputs: true });

            // Add inputs
            for (let i = 0; i < transactionData.utxos.length; i++) {
                const utxo = transactionData.utxos[i];
                
                log(`Processing input ${i}: ${utxo.txid}:${utxo.vout}`);
                log(`UTXO details: address=${utxo.address}, value=${utxo.value}, scriptPubKey=${utxo.scriptPubKey}`);
                
                // Convert txid to buffer (reverse for little-endian)
                const txidBuffer = hex.decode(utxo.txid).reverse();
                log(`TXID buffer: ${hex.encode(txidBuffer)}`);
                
                // Find address info for derivation path
                const addresses = await getAddresses();
                const addressInfo = addresses.find(addr => addr.address === utxo.address);
                
                if (!addressInfo) {
                    log(`Available addresses: ${addresses.map(a => a.address).join(', ')}`);
                    throw new Error(`Could not find address info for UTXO: ${utxo.txid}:${utxo.vout}`);
                }

                // Derive keys for this input
                const derivationPath = `m/86'/0'/0'/${addressInfo.isChange ? 1 : 0}/${addressInfo.index || 0}`;
                const keyData = await this.deriveTaprootKeys(seedPhrase, derivationPath);
                
                log(`Derived keys for ${utxo.address} with path: ${derivationPath}`);
                log(`xOnlyPubkey: ${hex.encode(keyData.xOnlyPubkey)}`);
                log(`scriptPubKey length: ${utxo.scriptPubKey.length}`);

                tx.addInput({
                    txid: txidBuffer,
                    index: utxo.vout,
                    witnessUtxo: {
                        script: hex.decode(utxo.scriptPubKey),
                        amount: BigInt(utxo.value),
                    },
                    tapInternalKey: keyData.xOnlyPubkey,
                });

                log(`✅ Added input ${i}: ${utxo.txid}:${utxo.vout} (${utxo.value} sats)`);
            }

            // Add destination output
            const amountInSatoshis = Math.floor(transactionData.amount * 100000000);
            const destinationScript = btc.OutScript.encode(btc.Address(this.currentNetwork).decode(transactionData.destinationAddress));
            
            tx.addOutput({
                script: destinationScript,
                amount: BigInt(amountInSatoshis),
            });

            log(`Added destination output: ${amountInSatoshis} sats to ${transactionData.destinationAddress}`);

            // Calculate change with proper fee estimation
            const totalInputValue = transactionData.utxos.reduce((sum, utxo) => sum + utxo.value, 0);
            const feeRate = transactionData.feeRate || 5; // sats/vbyte
            
            log(`Total input value: ${totalInputValue} sats`);
            log(`Amount to send: ${amountInSatoshis} sats`);
            log(`Fee rate: ${feeRate} sats/vbyte`);
            
            // Use @scure/btc-signer to estimate transaction size more accurately
            // For Taproot transactions: base size + (inputs * 57.5) + (outputs * 43)
            const numInputs = transactionData.utxos.length;
            const numOutputs = 2; // destination + change (estimated)
            const baseSize = 10; // version + locktime + input/output counts
            const inputSize = numInputs * 58; // Taproot input size (approximately)
            const outputSize = numOutputs * 43; // P2TR output size
            
            const estimatedVSize = baseSize + inputSize + outputSize;
            const estimatedFee = Math.ceil(estimatedVSize * feeRate);
            
            log(`Estimated transaction vSize: ${estimatedVSize} vbytes`);
            log(`Estimated fee: ${estimatedFee} sats`);
            
            const changeAmount = totalInputValue - amountInSatoshis - estimatedFee;
            log(`Calculated change amount: ${changeAmount} sats`);

            // Add change output if needed
            if (changeAmount > 546) { // Dust threshold
                let changeAddress = transactionData.changeAddress;
                
                if (!changeAddress) {
                    const addresses = await getAddresses();
                    changeAddress = addresses.find(addr => addr.isChange)?.address || addresses[0].address;
                }

                const changeScript = btc.OutScript.encode(btc.Address(this.currentNetwork).decode(changeAddress));
                
                tx.addOutput({
                    script: changeScript,
                    amount: BigInt(changeAmount),
                });

                log(`Added change output: ${changeAmount} sats to ${changeAddress}`);
            } else if (changeAmount > 0) {
                log(`Change amount ${changeAmount} sats too small (dust), adding to fee`);
            }

            // Sign each input
            for (let inputIndex = 0; inputIndex < transactionData.utxos.length; inputIndex++) {
                const utxo = transactionData.utxos[inputIndex];
                
                // Find the address for this UTXO
                const addresses = await getAddresses();
                const addressInfo = addresses.find(addr => addr.address === utxo.address);

                // Determine derivation path
                const derivationPath = `m/86'/0'/0'/${addressInfo.isChange ? 1 : 0}/${addressInfo.index || 0}`;
                
                // Derive keys for this input
                const keyData = await this.deriveTaprootKeys(seedPhrase, derivationPath);
                
                // Sign the input
                tx.sign(keyData.privateKey, inputIndex);
                
                log(`Signed input ${inputIndex} with derivation path: ${derivationPath}`);
            }

            // Finalize transaction
            tx.finalize();
            
            // Extract final transaction
            const finalTxBytes = tx.extract();
            const txHex = hex.encode(finalTxBytes);
            const txId = tx.id;

            log(`✅ Transaction successfully created and signed`);
            log(`TXID: ${txId}`);
            log(`Size: ${finalTxBytes.length} bytes`);

            return {
                success: true,
                txid: txId,
                signedTxHex: txHex,
                size: finalTxBytes.length
            };

        } catch (error) {
            log(`❌ Error creating/signing transaction: ${error.message}`);
            console.error('[BitcoinScureSigner] Full error:', error);
            throw error;
        }
    }

    /**
     * Sign a pre-built PSBT (for compatibility with existing code)
     */
    async signPSBT(psbtHex, utxos, logCallback = null) {
        const log = (message) => {
            if (logCallback) logCallback(message);
            console.log('[BitcoinScureSigner]', message);
        };

        try {
            log('Starting PSBT signing...');
            
            // Determine network
            await this.determineNetwork();
            
            // Get seed phrase
            const seedPhrase = await getSeedPhrase();
            if (!seedPhrase) {
                throw new Error('Seed phrase not found in storage');
            }

            // Parse PSBT
            const psbt = btc.Transaction.fromPSBT(hex.decode(psbtHex), {
                network: this.currentNetwork
            });

            log('PSBT parsed successfully');

            // Sign each input
            for (let inputIndex = 0; inputIndex < psbt.inputsLength; inputIndex++) {
                const utxo = utxos[inputIndex];
                
                if (!utxo) {
                    throw new Error(`No UTXO data provided for input ${inputIndex}`);
                }

                // Find the address for this UTXO
                const addresses = await getAddresses();
                const addressInfo = addresses.find(addr => addr.address === utxo.address);

                if (!addressInfo) {
                    throw new Error(`Could not find address info for UTXO: ${utxo.txid}:${utxo.vout}`);
                }

                // Determine derivation path
                const derivationPath = `m/86'/0'/0'/${addressInfo.isChange ? 1 : 0}/${addressInfo.index || 0}`;
                
                // Derive keys for this input
                const keyData = await this.deriveTaprootKeys(seedPhrase, derivationPath);
                
                // Update input with witnessUtxo if needed
                const input = psbt.getInput(inputIndex);
                if (!input.witnessUtxo) {
                    psbt.updateInput(inputIndex, {
                        witnessUtxo: {
                            script: keyData.p2tr.script,
                            amount: BigInt(utxo.value)
                        }
                    });
                    log(`Updated witnessUtxo for input ${inputIndex}`);
                }

                // Sign the input
                psbt.sign(keyData.privateKey);
                log(`Signed input ${inputIndex} with derivation path: ${derivationPath}`);
            }

            // Finalize
            psbt.finalize();
            log('PSBT finalized');

            // Extract final transaction
            const finalTx = psbt.extract();
            const txHex = hex.encode(finalTx);
            const txId = btc.Transaction.fromRaw(finalTx, {
                network: this.currentNetwork,
                allowUnknownOutputs: true
            }).id;

            log(`✅ PSBT successfully signed and finalized`);
            log(`TXID: ${txId}`);

            return {
                success: true,
                txid: txId,
                signedTxHex: txHex,
                size: finalTx.length
            };

        } catch (error) {
            log(`❌ Error signing PSBT: ${error.message}`);
            console.error('[BitcoinScureSigner] Full error:', error);
            throw error;
        }
    }
}

// Create singleton instance
const bitcoinScureSigner = new BitcoinScureSigner();

export { bitcoinScureSigner, BitcoinScureSigner };
export default bitcoinScureSigner;
