import * as btc from '@scure/btc-signer';
import { mnemonicToSeed } from '@scure/bip39';
import { HDKey } from '@scure/bip32';

export class BitcoinKeyDerivation {
    constructor(network) {
        this.network = network;
    }

    async deriveTaprootKeys(mnemonic, derivationPath = "m/86'/0'/0'/0/0") {
        const seed = await mnemonicToSeed(mnemonic);
        const hdkey = HDKey.fromMasterSeed(seed);
        const derivedKey = hdkey.derive(derivationPath);

        if (!derivedKey.privateKey) {
            throw new Error('Failed to derive private key');
        }

        const xOnlyPubkey = derivedKey.publicKey.slice(1);
        const p2tr = btc.p2tr(xOnlyPubkey, undefined, this.network);

        return {
            type: 'p2tr',
            privateKey: derivedKey.privateKey,
            publicKey: derivedKey.publicKey,
            xOnlyPubkey,
            p2tr,
            address: p2tr.address,
        };
    }

    /**
     * BIP84 P2WPKH derivation. Used to spend from native-segwit wallet
     * addresses (`bc1q...`) — the wallet derives ONE such address at index 0
     * alongside the Taproot tree, so legacy/segwit-only flows still work.
     */
    async deriveP2WPKHKeys(mnemonic, derivationPath = "m/84'/0'/0'/0/0") {
        const seed = await mnemonicToSeed(mnemonic);
        const hdkey = HDKey.fromMasterSeed(seed);
        const derivedKey = hdkey.derive(derivationPath);

        if (!derivedKey.privateKey) {
            throw new Error('Failed to derive private key');
        }

        const p2wpkh = btc.p2wpkh(derivedKey.publicKey, this.network);

        return {
            type: 'p2wpkh',
            privateKey: derivedKey.privateKey,
            publicKey: derivedKey.publicKey,
            p2wpkh,
            address: p2wpkh.address,
        };
    }

    createTaprootAddress(xOnlyPubkey) {
        const p2tr = btc.p2tr(xOnlyPubkey, undefined, this.network);
        return p2tr.address;
    }
}
