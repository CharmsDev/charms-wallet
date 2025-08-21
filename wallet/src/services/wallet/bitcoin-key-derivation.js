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
            privateKey: derivedKey.privateKey,
            publicKey: derivedKey.publicKey,
            xOnlyPubkey,
            p2tr,
            address: p2tr.address
        };
    }

    createTaprootAddress(xOnlyPubkey) {
        const p2tr = btc.p2tr(xOnlyPubkey, undefined, this.network);
        return p2tr.address;
    }
}
