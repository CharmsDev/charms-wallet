/**
 * Step 4: Sign and broadcast the Bitcoin beam transaction.
 *
 * Input:  spellTxHex, prevTxMap, inputSigningMap, seedPhrase, network
 * Output: { btcTxid }
 */

import { signSpellTxMultiKey } from '@/services/charm-transfer/tx-signer';
import { broadcastTx } from '@/services/charm-transfer/broadcaster';

export async function signAndBroadcastBtc({
  spellTxHex, prevTxMap, inputSigningMap, seedPhrase, network, onStatus,
}) {
  onStatus?.('Signing Bitcoin transaction...');
  const signedTxHex = await signSpellTxMultiKey(
    spellTxHex, prevTxMap, inputSigningMap, seedPhrase, network,
  );

  onStatus?.('Broadcasting Bitcoin transaction...');
  const btcTxid = await broadcastTx(signedTxHex, network);

  onStatus?.(`Bitcoin tx broadcast: ${btcTxid}`);
  return { btcTxid };
}
