/**
 * TAPROOT SPELL TRANSACTION SIGNING SCRIPT
 * 
 * This script signs a Taproot spell transaction using bitcoin-cli.
 * It signs the first input of a transaction that spends from a P2TR (Pay-to-Taproot) output.
 * 
 * Key features:
 * - Uses bitcoin-cli's signrawtransactionwithwallet command
 * - Provides the necessary UTXO information for the input being signed
 * - Preserves the witness data for the second input (which contains the spell)
 * - Signs with Schnorr signature (required for Taproot)
 */

// ------ ALL INPUTS AND CONFIGURATION ------

// Required libraries
const sdk = require('@unisat/wallet-sdk');
const bip39 = require('bip39');
const ecc = require('tiny-secp256k1');
const { BIP32Factory } = require('bip32');

// Extract needed components from SDK
const { AddressType } = sdk;
const { LocalWallet } = sdk.wallet;
const { bitcoin } = sdk.core;

// Create BIP32 instance
const bip32 = BIP32Factory(ecc);

// Network settings (testnet or mainnet)
const network = bitcoin.networks.testnet;

// Your BIP-39 seed phrase (12 or 24 words)
const seedPhrase = 'weird view crack fork nut custom hidden tent sketch dutch energy easy';

// Transaction hex data
const unsignedCommitTxHex = "0200000001e56fade9ed4657a74fb49e17d35d80b57e632258c300ac76ce3d2ff62391694d0000000000ffffffff01a3490000000000002251200593fea30f55a0c6d5bf872f3722bab1e79a07c77921234b6fc002b4bd5877df00000000";
const unsignedSpellTxHex = "020000000001020ddd5a3398029480e3b88cb5a6a305a13b03093c90fa33af531bed2ebe507a500000000000ffffffff5521b4ece6b1b0afef5632797099b1b11f2e9d27a9de9b7384f386a5bab3825c0000000000ffffffff02e8030000000000002251206eb2ec4ab68e29176884e783dfd93bc42b9310f5ae47a202d0978988cebe1f879846000000000000225120d9bd818762f2af087e5a49aca2077e7050df90ce3f546f80392f4828fa94e528000341df52ec0e6d664245542a9dd1917ae0ae6fc931ca456bb2b89fcd1227952f2eda091c4f3b37b0ed5de0af8c90192cc0fe1a4c856f56d9a3768bdb14676995679881fdef020063057370656c6c4d080282a36776657273696f6e02627478a2647265667380646f75747381a100a2667469636b657268434841524d532d376972656d61696e696e671a000186a0716170705f7075626c69635f696e70757473a183616e982018c21837185318950c18dc0218c418f7184118c918a718e118f518d7181918a51843188c18cd185a18930c184b1867182418ae18ec18550b183b189398201835189300183218d718b818ac131880189f18df1858182d188718df1851185418bc183a185a182018dd18990218421827188b1618ef1839183110f69901041118b618a0189d182b187c18b8051824184d187b18721869184c0c18190b1818188118dc183d18781873186610184318ef18e9185218d4182a18731884183b1818186c0318e7186d18ae1886187c1836183e18531118711718fa188018af18ef1818189d18c5189c18c81850184818dd1842181f18e9188218e418f9185318f5182f1824188818a51873185518e318bf15185d18c318ab18da187f1882189d185c1889186a18ad18a9184518e718981832187918a018b318c2021847188c1218371881181d188618b30818d118e118791892189b18d818bb1849181e1872182818ae185818fd1899184c18471836182e18e518a118aa18e21828187a06186418b418510218ef1879189c1886188818dd18ee1860187218da0d189d183b18a918ac1887184118d1185d1828187918f0183e181918ba184cb73f18a20018ee18f018de18b7189a18851884187f18201118721868183a188f18b918fd18de189a1849189518921894188e04186a188d18ff18411890185618b315184b18281838185718a009188118b3189f18b618f9186618fa00182a18b218c31849182c18e7186718dd18ab18d1186c18bf183a18a5184c185f151018db189d186618d718a6186718af0218bb189018c618cd18a718e418ba18f4184718800f18f31879188418840b184718e71884011899188118f26820d4a03d185451c4ebe8146027691a848f1ebe4c7117baf83068e33103cc278020ac21c1d4a03d185451c4ebe8146027691a848f1ebe4c7117baf83068e33103cc27802000000000";

// Transaction constants
const inputIndex = 0;              // Index of the input we're signing
const rbfSequence = 0xFFFFFFFD;    // Opt-in Replace-By-Fee sequence number
const derivationPath = "m/86'/0'/0'/0/0"; // BIP86 Taproot - receiving address

// UTXO details for the first input of the spell transaction
// This is the output we're spending from the commit transaction
const utxoTxId = "507a50be2eed1b53af33fa903c09033ba105a3a6b58cb8e380940298335add0d";
const utxoVout = 0;
const utxoAmount = 18851; // Amount in satoshis from the commit tx output
const utxoScript = Buffer.from('51206eb2ec4ab68e29176884e783dfd93bc42b9310f5ae47a202d0978988cebe1f87', 'hex');

// ------ UTILITY FUNCTIONS ------

// Function to parse a transaction and extract details
function parseTx(txHex) {
  const tx = bitcoin.Transaction.fromHex(txHex);
  return tx;
}

// ------ MAIN FUNCTIONS ------

// Function to get UTXO details from bitcoin-cli
async function getUtxoDetails(txid, vout) {
  try {
    const command = `bitcoin-cli gettxout ${txid} ${vout} true`;
    const { stdout, stderr } = await execPromise(command);

    if (stderr) {
      throw new Error(`Error getting UTXO details: ${stderr}`);
    }

    const utxoDetails = JSON.parse(stdout);
    return {
      scriptPubKey: utxoDetails.scriptPubKey.hex,
      amount: utxoDetails.value
    };
  } catch (error) {
    console.error('Error in getUtxoDetails:', error);
    throw error;
  }
}

// Function to sign the spell transaction using bitcoin-cli
async function signSpellTransaction() {
  try {
    // Parse the commit transaction to get the output details
    const commitTx = parseTx(unsignedCommitTxHex);

    // Parse the unsigned spell transaction
    const spellTx = parseTx(unsignedSpellTxHex);

    // Get the commit transaction output script and value
    const commitTxOutput = commitTx.outs[0];
    const scriptPubKey = commitTxOutput.script.toString('hex');
    const amount = commitTxOutput.value / 100000000; // Convert satoshis to BTC

    // Get the commit transaction txid
    const commitTxId = commitTx.getId();

    console.log(`Commit TX ID: ${commitTxId}`);
    console.log(`Commit TX Output: scriptPubKey=${scriptPubKey}, amount=${amount}`);

    // Format the command exactly as in the wallet.rs file
    const signCommand = `bitcoin-cli signrawtransactionwithwallet "${unsignedSpellTxHex}" '[{"txid":"${commitTxId}","vout":0,"scriptPubKey":"${scriptPubKey}","amount":${amount}}]' | jq -r '.hex'`;
    console.log(`Executing command: ${signCommand}`);

    // Execute the command
    const { stdout, stderr } = await execPromise(signCommand);

    if (stderr) {
      throw new Error(`Error signing transaction: ${stderr}`);
    }

    // The result is just the hex string since we used jq to extract it
    const signedTxHex = stdout.trim();

    // Parse the signed transaction to get the txid
    const signedTx = parseTx(signedTxHex);
    const txId = signedTx.getId();

    // Return the signed transaction hex and transaction ID
    return {
      signedTxHex,
      txId
    };
  } catch (error) {
    console.error('Error in signSpellTransaction:', error);
    throw error;
  }
}

// Promisify exec for async/await usage
function execPromise(command) {
  const { exec } = require('child_process');
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

// ------ EXECUTION ------

// Execute the transaction signing and log the result
signSpellTransaction()
  .then(result => {
    console.log(`Spell transaction signed successfully!`);
    console.log(`Transaction ID: ${result.txId}`);

    // Format the output to match what the user wants
    console.log(`\nTest the signed transaction with Bitcoin Core:`);
    console.log(`bitcoin-cli testmempoolaccept '["${result.signedTxHex}"]'`);
  })
  .catch(error => {
    console.error('ERROR:', error.message);
  });
