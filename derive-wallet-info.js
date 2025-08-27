const bitcoin = require('bitcoinjs-lib');
const ecc = require('tiny-secp256k1');
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');

// Initialize libraries
bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

async function deriveWalletInfo(seedPhrase) {
    try {
        // Convert seed phrase to seed
        const seed = await bip39.mnemonicToSeed(seedPhrase);

        // Derive the master node using testnet network
        const masterNode = bip32.fromSeed(seed, bitcoin.networks.testnet);

        // Get master key fingerprint (hex)
        const fingerprintBuffer = bitcoin.crypto.hash160(masterNode.publicKey).slice(0, 4);
        const masterFingerprint = Buffer.from(fingerprintBuffer).toString('hex');

        // Use testnet4 path
        const path = "m/86'/1'/0'";
        
        // Derive the account node
        const accountNode = masterNode.derivePath(path);

        // Get the xpriv (for testnet, this will be a tprv)
        const xpriv = accountNode.toBase58();

        console.log('Wallet Information:');
        console.log('Master Fingerprint:', masterFingerprint);
        console.log('Derivation Path:', path);
        console.log('Extended Private Key:', xpriv);
        console.log('');
        console.log('Receiving Descriptor:');
        console.log(`tr([${masterFingerprint}/${path.slice(2)}]${xpriv}/0/*)`);
        console.log('');
        console.log('Change Descriptor:');
        console.log(`tr([${masterFingerprint}/${path.slice(2)}]${xpriv}/1/*)`);

        return {
            masterFingerprint,
            path: path.slice(2), // Remove 'm/' prefix
            xpriv
        };
    } catch (error) {
        console.error('Error deriving wallet info:', error);
        throw error;
    }
}

// You need to replace this with your actual seed phrase
const seedPhrase = "YOUR_ACTUAL_SEED_PHRASE_HERE";

if (seedPhrase === "YOUR_ACTUAL_SEED_PHRASE_HERE") {
    console.log("Please replace the seed phrase in the script with your actual seed phrase.");
    console.log("Then run: node derive-wallet-info.js");
} else {
    deriveWalletInfo(seedPhrase);
}
