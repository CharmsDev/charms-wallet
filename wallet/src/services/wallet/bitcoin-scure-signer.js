import * as btc from '@scure/btc-signer';
import { hex } from '@scure/base';
import { getSeedPhrase, getAddresses } from '@/services/storage';
import { BitcoinKeyDerivation } from './bitcoin-key-derivation';
import { getNetwork } from '@/utils/addressUtils';
class BitcoinScureSigner {
    constructor(network) {
        if (!network) {
            throw new Error('BitcoinScureSigner requires a network.');
        }
        this.network = getNetwork(network);
        this.keyDerivation = new BitcoinKeyDerivation(this.network);
    }

    async deriveTaprootKeys(mnemonic, derivationPath = "m/86'/0'/0'/0/0") {
        return await this.keyDerivation.deriveTaprootKeys(mnemonic, derivationPath);
    }

    createTaprootAddress(xOnlyPubkey) {
        return this.keyDerivation.createTaprootAddress(xOnlyPubkey);
    }

    async createAndSignTransaction(transactionData, logCallback = null) {
        const log = (message) => {
            if (logCallback) logCallback(message);
        };

        try {
            log('Starting Bitcoin transaction creation and signing...');

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

            console.log(`[BitcoinScureSigner] Creating transaction: ${transactionData.amount} BTC to ${transactionData.destinationAddress} using ${transactionData.utxos.length} UTXOs`);
            log(`Using ${transactionData.utxos.length} UTXOs`);

            // Create transaction using @scure/btc-signer
            const tx = new btc.Transaction({
                allowUnknownOutputs: true,
                allowUnknownInputs: true
            });

            // Add inputs
            for (let i = 0; i < transactionData.utxos.length; i++) {
                const utxo = transactionData.utxos[i];
                
                log(`Processing input ${i}: ${utxo.txid}:${utxo.vout}`);
                log(`UTXO details: address=${utxo.address}, value=${utxo.value}, scriptPubKey=${utxo.scriptPubKey}`);
                log(`Full UTXO structure:`, JSON.stringify(utxo, null, 2));
                
                const addresses = await getAddresses();
                const addressInfo = addresses.find(addr => addr.address === utxo.address);

                if (!addressInfo) {
                    throw new Error(`Could not find address info for UTXO: ${utxo.txid}:${utxo.vout}`);
                }

                const derivationPath = `m/86'/0'/0'/${addressInfo.isChange ? 1 : 0}/${addressInfo.index || 0}`;
                const keyData = await this.deriveTaprootKeys(seedPhrase, derivationPath);
                
                if (keyData.address !== utxo.address) {
                    throw new Error(`Address mismatch for UTXO ${utxo.txid}:${utxo.vout}. Expected: ${utxo.address}, Got: ${keyData.address}`);
                }

                const txidBuffer = hex.decode(utxo.txid);
                
                let scriptPubKey;
                try {
                    const decoded = btc.Address(this.network).decode(utxo.address);
                    scriptPubKey = '5120' + hex.encode(decoded.pubkey);
                } catch (error) {
                    scriptPubKey = hex.encode(keyData.p2tr.script);
                }

                tx.addInput({
                    txid: txidBuffer,
                    index: utxo.vout,
                    witnessUtxo: {
                        script: hex.decode(scriptPubKey),
                        amount: BigInt(utxo.value),
                    },
                    tapInternalKey: keyData.xOnlyPubkey,
                });

                log(`✅ Added input ${i}: ${utxo.txid}:${utxo.vout} (${utxo.value} sats)`);
            }

            const amountInSatoshis = Math.floor(transactionData.amount * 100000000);
            const destinationScript = btc.OutScript.encode(btc.Address(this.network).decode(transactionData.destinationAddress));
            
            tx.addOutput({
                script: destinationScript,
                amount: BigInt(amountInSatoshis),
            });

            const totalInputValue = transactionData.utxos.reduce((sum, utxo) => sum + utxo.value, 0);
            const feeRate = transactionData.feeRate || 5;
            
            const numInputs = transactionData.utxos.length;
            const numOutputs = 2;
            const baseSize = 10;
            const inputSize = numInputs * 58;
            const outputSize = numOutputs * 43;
            
            const estimatedVSize = baseSize + inputSize + outputSize;
            const estimatedFee = Math.ceil(estimatedVSize * feeRate);
            
            const changeAmount = totalInputValue - amountInSatoshis - estimatedFee;

            if (changeAmount > 546) {
                let changeAddress = transactionData.changeAddress;
                
                if (!changeAddress) {
                    const addresses = await getAddresses();
                    changeAddress = addresses.find(addr => addr.isChange)?.address || addresses[0].address;
                }

                const changeScript = btc.OutScript.encode(btc.Address(this.network).decode(changeAddress));
                
                tx.addOutput({
                    script: changeScript,
                    amount: BigInt(changeAmount),
                });
            }

            const addressesAll = await getAddresses();
            const keyMap = new Map();

            for (let inputIndex = 0; inputIndex < transactionData.utxos.length; inputIndex++) {
                const utxo = transactionData.utxos[inputIndex];
                const addressInfo = addressesAll.find(addr => addr.address === utxo.address);
                if (!addressInfo) {
                    throw new Error(`Could not find address info for UTXO: ${utxo.txid}:${utxo.vout}`);
                }
                const derivationPath = `m/86'/0'/0'/${addressInfo.isChange ? 1 : 0}/${addressInfo.index || 0}`;
                const keyData = await this.deriveTaprootKeys(seedPhrase, derivationPath);
                const xOnlyHex = hex.encode(keyData.xOnlyPubkey);
                if (!keyMap.has(xOnlyHex)) {
                    keyMap.set(xOnlyHex, { privateKey: keyData.privateKey, derivationPath });
                }
            }

            for (const [xOnlyHex, { privateKey, derivationPath }] of keyMap.entries()) {
                const signedCount = tx.sign(privateKey);
                if (signedCount === 0) {
                    throw new Error(`No inputs signed for key ${xOnlyHex} (path ${derivationPath})`);
                }
            }

            // Verify all inputs have a signature before finalizing
            for (let i = 0; i < tx.inputsLength; i++) {
                const inp = tx.getInput(i);
                log(`Input ${i} verification: ${inp ? 'exists' : 'missing'}`);
                if (inp) {
                    // Check various possible witness/signature properties
                    const hasWitness = inp.witness && inp.witness.length > 0;
                    const hasTapKeySig = inp.tapKeySig && inp.tapKeySig.length > 0;
                    const hasFinalScriptWitness = inp.finalScriptWitness && inp.finalScriptWitness.length > 0;
                    
                    log(`Input ${i} witness check: witness=${hasWitness}, tapKeySig=${hasTapKeySig}, finalScriptWitness=${hasFinalScriptWitness}`);
                    
                    if (!hasWitness && !hasTapKeySig && !hasFinalScriptWitness) {
                        log(`Input ${i} properties:`, Object.keys(inp));
                    }
                } else {
                    throw new Error(`Input ${i} is missing`);
                }
            }

            for (let i = 0; i < tx.inputsLength; i++) {
                const input = tx.getInput(i);
                if (!input.tapKeySig) {
                    throw new Error(`Input ${i} is missing signature`);
                }
            }

            tx.finalize();

            const finalTxBytes = tx.extract();
            const txHex = hex.encode(finalTxBytes);
            const txId = btc.Transaction.fromRaw(finalTxBytes, {
                network: this.network,
                allowUnknownOutputs: true
            }).id;

            log(`✅ Transaction successfully created and signed`);
            log(`TXID: ${txId}`);
            log(`Size: ${finalTxBytes.length} bytes`);
            log(`Full transaction hex: ${txHex}`);
            
            // Log input details for debugging
            log('Transaction inputs:');
            for (let i = 0; i < transactionData.utxos.length; i++) {
                const utxo = transactionData.utxos[i];
                log(`  Input ${i}: ${utxo.txid}:${utxo.vout} (${utxo.value} sats) from ${utxo.address}`);
            }
            
            // Verify address derivation matches UTXO addresses
            log('Verifying address derivation:');
            for (let i = 0; i < transactionData.utxos.length; i++) {
                const utxo = transactionData.utxos[i];
                const addressInfo = addressesAll.find(addr => addr.address === utxo.address);
                if (addressInfo) {
                    const derivationPath = `m/86'/0'/0'/${addressInfo.isChange ? 1 : 0}/${addressInfo.index || 0}`;
                    log(`  Input ${i} derivation: ${derivationPath} -> Expected: ${utxo.address}`);
                    
                    // Derive the address to verify it matches
                    try {
                        const keyData = await this.deriveTaprootKeys(seedPhrase, derivationPath);
                        const derivedAddress = this.createTaprootAddress(keyData.xOnlyPubkey);
                        const matches = derivedAddress === utxo.address;
                        log(`  Input ${i} verification: Derived: ${derivedAddress}, Matches: ${matches}`);
                        
                        if (!matches) {
                            log(`  ❌ ADDRESS MISMATCH for input ${i}!`);
                        }
                    } catch (error) {
                        log(`  ❌ Error verifying address for input ${i}: ${error.message}`);
                    }
                } else {
                    log(`  ❌ No address info found for UTXO address: ${utxo.address}`);
                }
            }

            return {
                success: true,
                txid: txId,
                signedTxHex: txHex,
                size: finalTxBytes.length
            };

        } catch (error) {
            throw error;
        }
    }


}

export { BitcoinScureSigner };
export default BitcoinScureSigner;
