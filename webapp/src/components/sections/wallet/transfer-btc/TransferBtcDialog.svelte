<script lang="ts">
    // TransferBtcDialog - Handles basic Bitcoin transfers
    import { wallet } from "@stores/wallet";
    import { addresses } from "@stores/addresses";
    import { utxos } from "@stores/utxos";
    import {
        transferService,
        transactionService,
        broadcastTransactionService,
    } from "@services/transaction";
    import type { TxDetails, RawTx } from "@app-types/transaction";
    import { get } from "svelte/store";
    import ConfirmDialog from "@components/ConfirmDialog.svelte";
    import TransferForm from "@components/sections/wallet/transfer-btc/TransferForm.svelte";
    import RawTransactionDisplay from "@components/sections/wallet/transfer-btc/RawTransactionDisplay.svelte";
    import UTXOListDisplay from "@components/sections/wallet/transfer-btc/UTXOListDisplay.svelte";

    let showConfirmDialog = false;
    let isSigningMode = false;
    let signedTx: string | null = null;
    let signatures: string[] | null = null;
    interface PendingTx extends TxDetails {
        rawTx?: RawTx;
    }
    let pendingTx: PendingTx | null = null;

    export let isOpen = false;
    export let onClose: () => void;

    function handleClose() {
        // Reset all form state
        amount = "";
        address = "";
        error = "";
        pendingTx = null;
        signedTx = null;
        signatures = null;
        isSigningMode = false;
        onClose();
    }

    $: if (isOpen) {
        const addressList = get(addresses);
        if (addressList.length > 0) {
            const addressStrings = addressList.map((addr) => addr.address);
            utxos.fetchUTXOs(addressStrings);
        }
    }

    let amount = "";
    let address = "";
    let error = "";
    let isLoading = false;

    async function handleSubmit() {
        if (!$wallet) {
            error = "No wallet available";
            return;
        }

        error = "";
        isLoading = true;

        try {
            const amountNum = parseFloat(amount);
            if (isNaN(amountNum) || amountNum <= 0) {
                throw new Error("Invalid amount");
            }

            if (!address.trim()) {
                throw new Error("Please enter a recipient address");
            }

            const result = await transferService.transfer({
                amount: amountNum,
                recipientAddress: address.trim(),
                privateKey: $wallet.private_key,
                sourceAddress: $wallet.address,
            });

            if (result.needsConfirmation && result.details) {
                pendingTx = {
                    ...result.details,
                    rawTx: result.rawTx,
                };
                isSigningMode = true;
            }
        } catch (err) {
            error = err instanceof Error ? err.message : "Transfer failed";
        } finally {
            isLoading = false;
        }
    }
    async function signTransaction() {
        if (!pendingTx?.rawTx || !$wallet) return;

        try {
            error = "";
            isLoading = true;
            const result = await transactionService.signTransaction(
                pendingTx.rawTx.hex,
                $wallet.private_key,
            );
            const signedTxData = {
                signatures: [result.signature],
                hex: result.hex,
                hash: result.hash,
                txid: result.txid,
            };
            signatures = signedTxData.signatures;
            signedTx = JSON.stringify(signedTxData);
        } catch (err) {
            error = err instanceof Error ? err.message : "Signing failed";
        } finally {
            isLoading = false;
        }
    }

    async function broadcastTransaction() {
        if (!signedTx) return;

        try {
            error = "";
            isLoading = true;
            await broadcastTransactionService.broadcastTransaction(signedTx);
            showConfirmDialog = false;
            onClose();
        } catch (err) {
            error = err instanceof Error ? err.message : "Broadcasting failed";
            showConfirmDialog = false;
        } finally {
            isLoading = false;
        }
    }
</script>

{#if isOpen}
    <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
    <div class="fixed inset-0 z-10 overflow-y-auto">
        <div
            class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0"
        >
            <div
                class="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:p-6"
            >
                <div class="absolute right-0 top-0 pr-4 pt-4">
                    <button
                        type="button"
                        class="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
                        on:click={handleClose}
                    >
                        <span class="sr-only">Close</span>
                        <svg
                            class="h-6 w-6"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="1.5"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>

                <div class="sm:flex sm:items-start">
                    <div
                        class="mt-3 text-center sm:mt-0 sm:text-left w-full max-h-[80vh] overflow-y-auto pr-2"
                    >
                        <h3
                            class="text-lg font-semibold leading-6 text-gray-900 sticky top-0 bg-white pb-4"
                        >
                            Transfer Bitcoin
                        </h3>

                        <TransferForm
                            bind:amount
                            bind:address
                            bind:error
                            {isLoading}
                            {isSigningMode}
                            {signedTx}
                            onSubmit={handleSubmit}
                            onSign={signTransaction}
                            onBroadcast={() => (showConfirmDialog = true)}
                            onCancel={handleClose}
                        />

                        {#if signedTx}
                            <div class="border-t border-gray-200 pt-4">
                                <h4 class="text-sm font-medium text-gray-900">
                                    Signed Transaction Hash
                                </h4>
                                <div
                                    class="mt-2 bg-gray-50 p-3 rounded-md overflow-x-auto"
                                >
                                    <pre
                                        class="text-xs text-gray-600">{JSON.stringify(
                                            JSON.parse(signedTx),
                                            null,
                                            2,
                                        )}</pre>
                                </div>
                            </div>
                        {/if}

                        {#if pendingTx?.rawTx}
                            <RawTransactionDisplay rawTx={pendingTx.rawTx} />
                        {/if}

                        <UTXOListDisplay />

                        <ConfirmDialog
                            isOpen={showConfirmDialog}
                            title="Broadcast Transaction"
                            message="Are you sure you want to broadcast this signed transaction?"
                            onConfirm={broadcastTransaction}
                            onCancel={() => (showConfirmDialog = false)}
                        />
                    </div>
                </div>
            </div>
        </div>
    </div>
{/if}
