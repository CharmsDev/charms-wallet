import * as btc from '@scure/btc-signer';
import { hex } from '@scure/base';
import { getSeedPhrase, getAddresses } from '@/services/storage';
import { BitcoinKeyDerivation } from './bitcoin-key-derivation';
import { NETWORKS } from '@/stores/blockchainStore';
import { calculateMixedFee } from '@/services/wallet/utils/fee';

// Absolute maximum fee in satoshis — safety net to prevent fund loss
const MAX_FEE_SATS = 5000;

// Map blockchainStore network id to a minimal scure/btc network object.
// For Taproot and bech32 address decoding, bech32 HRP is sufficient.
function mapScureNetwork(networkId) {
    if (typeof networkId === 'object' && networkId?.bech32) return networkId;
    if (networkId === NETWORKS.BITCOIN.MAINNET) return { bech32: 'bc' };
    // Default to testnet4/regtest HRP 'tb' for non-mainnet bitcoin
    return { bech32: 'tb' };
}
class BitcoinScureSigner {
    constructor(network) {
        if (!network) {
            throw new Error('BitcoinScureSigner requires a network.');
        }
        this.network = mapScureNetwork(network);
        this.isMainnetNetwork = this.network.bech32 === 'bc';
        this.coinType = this.isMainnetNetwork ? 0 : 1;
        this.keyDerivation = new BitcoinKeyDerivation(this.network);
    }

    async deriveTaprootKeys(mnemonic, derivationPath = "m/86'/0'/0'/0/0") {
        return await this.keyDerivation.deriveTaprootKeys(mnemonic, derivationPath);
    }

    async deriveP2WPKHKeys(mnemonic, derivationPath = "m/84'/0'/0'/0/0") {
        return await this.keyDerivation.deriveP2WPKHKeys(mnemonic, derivationPath);
    }

    createTaprootAddress(xOnlyPubkey) {
        return this.keyDerivation.createTaprootAddress(xOnlyPubkey);
    }

    /**
     * Detect the script type of a wallet address by its bech32 prefix.
     * `bc1p...` / `tb1p...` → P2TR (Taproot, BIP86)
     * `bc1q...` / `tb1q...` → P2WPKH (Native SegWit, BIP84)
     */
    _scriptTypeOf(address) {
        if (typeof address !== 'string') return null;
        const a = address.toLowerCase();
        if (a.startsWith('bc1p') || a.startsWith('tb1p')) return 'p2tr';
        if (a.startsWith('bc1q') || a.startsWith('tb1q')) return 'p2wpkh';
        return null;
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

            log(`Using ${transactionData.utxos.length} UTXOs`);

            // Create transaction using @scure/btc-signer
            const tx = new btc.Transaction({
                allowUnknownOutputs: true,
                allowUnknownInputs: true
            });

            // Add inputs — supports BOTH P2TR (bc1p, BIP86) and P2WPKH (bc1q,
            // BIP84). The wallet derives one P2WPKH address at index 0 and a
            // tree of P2TR addresses, so a single send may mix both types.
            for (let i = 0; i < transactionData.utxos.length; i++) {
                const utxo = transactionData.utxos[i];

                log(`Processing input ${i}: ${utxo.txid}:${utxo.vout}`);

                const blockchain = 'bitcoin';
                const network = this.isMainnetNetwork ? 'mainnet' : 'testnet4';
                const addresses = await getAddresses(blockchain, network);
                const addressInfo = addresses.find(addr => addr.address === utxo.address);

                if (!addressInfo) {
                    throw new Error(`Could not find address info for UTXO: ${utxo.txid}:${utxo.vout} (address: ${utxo.address})`);
                }

                const scriptType = this._scriptTypeOf(utxo.address);
                const coinType = this.isMainnetNetwork ? 0 : 1;

                if (scriptType === 'p2wpkh') {
                    // BIP84 — single receive address at index 0, no change tree.
                    const path = `m/84'/${coinType}'/0'/${addressInfo.isChange ? 1 : 0}/${addressInfo.index || 0}`;
                    const keyData = await this.deriveP2WPKHKeys(seedPhrase, path);
                    if (keyData.address !== utxo.address) {
                        throw new Error(`P2WPKH key mismatch for UTXO ${utxo.txid}:${utxo.vout}. Expected ${utxo.address}, got ${keyData.address}`);
                    }
                    tx.addInput({
                        txid: hex.decode(utxo.txid),
                        index: utxo.vout,
                        witnessUtxo: {
                            script: keyData.p2wpkh.script,
                            amount: BigInt(utxo.value),
                        },
                    });
                } else {
                    // BIP86 P2TR (default — also covers explicit p2tr).
                    const path = `m/86'/${coinType}'/0'/${addressInfo.isChange ? 1 : 0}/${addressInfo.index || 0}`;
                    const keyData = await this.deriveTaprootKeys(seedPhrase, path);
                    if (keyData.address !== utxo.address) {
                        throw new Error(`P2TR key mismatch for UTXO ${utxo.txid}:${utxo.vout}. Expected ${utxo.address}, got ${keyData.address}`);
                    }

                    let scriptPubKey;
                    try {
                        const decoded = btc.Address(this.network).decode(utxo.address);
                        scriptPubKey = '5120' + hex.encode(decoded.pubkey);
                    } catch (error) {
                        scriptPubKey = hex.encode(keyData.p2tr.script);
                    }

                    tx.addInput({
                        txid: hex.decode(utxo.txid),
                        index: utxo.vout,
                        witnessUtxo: {
                            script: hex.decode(scriptPubKey),
                            amount: BigInt(utxo.value),
                        },
                        tapInternalKey: keyData.xOnlyPubkey,
                    });
                }
            }

            const amountInSatoshis = transactionData.amountInSats || Math.floor(transactionData.amount * 100000000);
            const destinationScript = btc.OutScript.encode(btc.Address(this.network).decode(transactionData.destinationAddress));
            
            tx.addOutput({
                script: destinationScript,
                amount: BigInt(amountInSatoshis),
            });

            const totalInputValue = transactionData.utxos.reduce((sum, utxo) => sum + utxo.value, 0);
            const feeRate = transactionData.feeRate || 5;
            
            // First estimate with 2 outputs (destination + change)
            let estimatedFee = calculateMixedFee(transactionData.utxos, 2, feeRate);
            let changeAmount = totalInputValue - amountInSatoshis - estimatedFee;

            // If change is dust or negative, this is a max transaction — recalculate with 1 output
            if (changeAmount <= 546) {
                estimatedFee = calculateMixedFee(transactionData.utxos, 1, feeRate);
                changeAmount = totalInputValue - amountInSatoshis - estimatedFee;

                // If still negative but very close, adjust amount to fit (absorb rounding)
                if (changeAmount < 0 && changeAmount >= -546) {
                    // Reduce destination amount to cover the shortfall
                    const adjusted = amountInSatoshis + changeAmount; // changeAmount is negative
                    log(`Max tx: adjusting amount from ${amountInSatoshis} to ${adjusted} sats (diff: ${-changeAmount})`);
                    // Update the output we already added
                    tx.updateOutput(0, { script: destinationScript, amount: BigInt(adjusted) });
                    changeAmount = 0;
                }
            }

            // SAFETY: hard cap on fee to prevent fund loss
            if (estimatedFee > MAX_FEE_SATS) {
                throw new Error(`Fee ${estimatedFee} sats exceeds maximum allowed (${MAX_FEE_SATS} sats). Aborting to prevent fund loss.`);
            }

            // SAFETY: verify funds are sufficient
            if (changeAmount < 0) {
                throw new Error(`Insufficient funds: inputs (${totalInputValue}) < amount (${amountInSatoshis}) + fee (${estimatedFee}). Aborting.`);
            }

            if (changeAmount > 546) {
                let changeAddress = transactionData.changeAddress;
                
                if (!changeAddress) {
                    // Get addresses for the correct network
                    const blockchain = 'bitcoin';
                    const network = this.isMainnetNetwork ? 'mainnet' : 'testnet4';
                    const addresses = await getAddresses(blockchain, network);
                    changeAddress = addresses.find(addr => addr.isChange)?.address || addresses[0].address;
                }

                const changeScript = btc.OutScript.encode(btc.Address(this.network).decode(changeAddress));
                
                tx.addOutput({
                    script: changeScript,
                    amount: BigInt(changeAmount),
                });
            }

            // Build the deduped key map across both BIP86 (P2TR) and BIP84
            // (P2WPKH) inputs. `tx.sign(privateKey)` matches every input that
            // can be signed with that key, so we just need each unique
            // private key once.
            const blockchain = 'bitcoin';
            const network = this.isMainnetNetwork ? 'mainnet' : 'testnet4';
            const addressesAll = await getAddresses(blockchain, network);
            const keyMap = new Map(); // pubkeyHex → { privateKey, derivationPath }
            const coinType = this.isMainnetNetwork ? 0 : 1;

            for (const utxo of transactionData.utxos) {
                const addressInfo = addressesAll.find(addr => addr.address === utxo.address);
                if (!addressInfo) {
                    throw new Error(`Could not find address info for UTXO: ${utxo.txid}:${utxo.vout}`);
                }
                const scriptType = this._scriptTypeOf(utxo.address);
                const idx = addressInfo.index || 0;
                const branch = addressInfo.isChange ? 1 : 0;

                let keyData;
                if (scriptType === 'p2wpkh') {
                    const path = `m/84'/${coinType}'/0'/${branch}/${idx}`;
                    keyData = await this.deriveP2WPKHKeys(seedPhrase, path);
                } else {
                    const path = `m/86'/${coinType}'/0'/${branch}/${idx}`;
                    keyData = await this.deriveTaprootKeys(seedPhrase, path);
                }
                const pubkeyHex = hex.encode(keyData.publicKey);
                if (!keyMap.has(pubkeyHex)) {
                    keyMap.set(pubkeyHex, { privateKey: keyData.privateKey, type: keyData.type });
                }
            }

            for (const [, { privateKey }] of keyMap.entries()) {
                tx.sign(privateKey); // ignore "no inputs signed" — other key handles them
            }

            // Verify every input has a signature (Taproot uses tapKeySig,
            // SegWit uses partialSig). Accept either.
            for (let i = 0; i < tx.inputsLength; i++) {
                const input = tx.getInput(i);
                if (!input) {
                    throw new Error(`Input ${i} is missing`);
                }
                const hasTaprootSig = !!input.tapKeySig;
                const hasSegwitSig  = Array.isArray(input.partialSig) && input.partialSig.length > 0;
                if (!hasTaprootSig && !hasSegwitSig) {
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

            log(`Transaction created: ${txId} (${finalTxBytes.length} bytes)`);
            

            return {
                success: true,
                txid: txId,
                signedTxHex: txHex,
                size: finalTxBytes.length,
                estimatedFee,
                changeAmount: changeAmount > 546 ? changeAmount : 0,
                changeAddress: changeAmount > 546 ? (transactionData.changeAddress || null) : null
            };

        } catch (error) {
            throw error;
        }
    }


}

export { BitcoinScureSigner };
export default BitcoinScureSigner;
