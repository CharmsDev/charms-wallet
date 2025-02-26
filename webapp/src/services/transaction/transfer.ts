import type { TransferParams, RawTx, UnsignedTx, TxDetails } from '@app-types/transaction';
import type { UTXO } from '@app-types/utxo';
import { utxoService } from '@services/wallet';
import { addresses } from '@stores/addresses';
import { utxos } from '@stores/utxos';
import { get } from 'svelte/store';
import { transactionService } from './index';

/**
 * Service for handling basic Bitcoin transfers.
 * Focuses on UTXO selection and fee calculation.
 * Uses transactionService for signing and broadcastTransactionService for broadcasting.
 */
class TransferService {
    private readonly FEE_RATE = 1; // sats/vbyte

    private estimateFee(inputCount: number, outputCount: number): number {
        const estimatedSize =
            (inputCount * 180) + // ~180 bytes per input
            (outputCount * 34) + // ~34 bytes per output
            10; // ~10 bytes overhead
        return estimatedSize * this.FEE_RATE;
    }

    private async findSuitableUTXOs(amountInSats: number, feeEstimate: number): Promise<{ utxos: UTXO[], address: string }> {
        // First refresh UTXOs for all addresses
        const addressEntries = get(addresses);
        const addressStrings = addressEntries.map(addr => addr.address);
        await utxos.fetchUTXOs(addressStrings);

        // Get fresh UTXOs
        const storedUtxos = get(utxos);
        console.log('Looking for UTXOs with amount:', amountInSats);
        console.log('Available addresses:', addressEntries);
        console.log('Fresh UTXOs:', storedUtxos);

        let bestAddress = null;
        let bestUtxos = null;
        let bestBalance = 0;

        for (const addressEntry of addressEntries) {
            console.log(`Checking address: ${addressEntry.address}`);
            const addressUtxos = storedUtxos[addressEntry.address] || [];
            console.log(`UTXOs for address:`, addressUtxos);

            const confirmedUtxos = addressUtxos.filter(utxo => utxo.status.confirmed);
            console.log(`Confirmed UTXOs:`, confirmedUtxos);

            const totalBalance = confirmedUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
            console.log(`Total confirmed balance: ${totalBalance}`);

            if (totalBalance >= amountInSats + feeEstimate) { // Amount + fee
                // Keep track of the address with the smallest sufficient balance
                if (bestBalance === 0 || totalBalance < bestBalance) {
                    bestAddress = addressEntry.address;
                    bestUtxos = confirmedUtxos;
                    bestBalance = totalBalance;
                }
            }
        }

        if (bestAddress && bestUtxos) {
            console.log(`Found suitable address: ${bestAddress} with balance: ${bestBalance}`);
            return { utxos: bestUtxos, address: bestAddress };
        }

        const totalRequired = amountInSats + feeEstimate;
        console.log(`No suitable address found. Required: ${totalRequired} sats (${amountInSats} + ${feeEstimate} fee)`);
        throw new Error(`Insufficient balance. Required: ${utxoService.formatSats(totalRequired)} BTC (including fee)`);
    }

    async transfer({ amount, recipientAddress, privateKey, sourceAddress }: TransferParams): Promise<UnsignedTx> {
        try {
            const amountInSats = Math.floor(amount * 100_000_000);

            // Estimate initial fee (assuming 1 input and 2 outputs)
            const initialFee = this.estimateFee(1, 2);

            // Find suitable UTXOs from available addresses
            const { utxos: selectedUtxos, address: selectedAddress } = await this.findSuitableUTXOs(amountInSats, initialFee);

            // Calculate total input amount
            const totalInput = selectedUtxos.reduce((sum, utxo) => sum + utxo.value, 0);

            // Prepare transaction details with actual input count
            const txDetails: TxDetails = {
                inputs: selectedUtxos.map(utxo => ({
                    txid: utxo.txid,
                    vout: utxo.vout,
                    value: utxo.value,
                })),
                outputs: [
                    {
                        address: recipientAddress,
                        value: amountInSats,
                    },
                    // Change output will be calculated after fee estimation
                ],
                fee: 0, // Will be calculated
                changeAddress: selectedAddress,
            };

            // Calculate actual fee based on input/output count
            txDetails.fee = this.estimateFee(txDetails.inputs.length, 2);

            // Calculate change
            const changeAmount = totalInput - amountInSats - txDetails.fee;
            if (changeAmount < 0) {
                throw new Error('Insufficient funds including fee');
            }

            if (changeAmount > 546) { // Dust limit
                txDetails.outputs.push({
                    address: selectedAddress,
                    value: changeAmount,
                });
            } else {
                // Add dust to fee
                txDetails.fee += changeAmount;
            }

            // Create raw transaction format
            const rawTx: RawTx = {
                version: 2,
                inputs: txDetails.inputs.map(input => ({
                    txid: input.txid,
                    vout: input.vout,
                    sequence: 0xffffffff,
                    value: input.value,
                })),
                outputs: txDetails.outputs.map(output => ({
                    address: output.address,
                    value: output.value,
                })),
                hex: '', // Will be populated by the transaction service
            };

            // Return unsigned transaction for confirmation
            return {
                details: txDetails,
                rawTx,
                needsConfirmation: true,
            };
        } catch (error) {
            console.error('Transfer failed:', error);
            throw error;
        }
    }
}

export const transferService = new TransferService();
