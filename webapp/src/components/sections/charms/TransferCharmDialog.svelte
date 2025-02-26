<script lang="ts">
    import type { ProcessedCharm } from "@app-types/charms";
    import { charmsService } from "@services/charms/index";
    import Modal from "@components/Modal.svelte";
    import { wallet } from "@stores/wallet";
    import { utxos } from "@stores/utxos";
    import { charms } from "@stores/charms";
    import {
        broadcastTransactionService,
        signTransactionService,
        transactionService,
    } from "@services/transaction";
    import type { SignedTransaction } from "@app-types/transaction";
    import { createTransferCharmTxs } from "@services/transfer-charm/createTxs";

    // Import new components
    import CharmInfo from "@components/sections/charms/transfer-charm/CharmInfo.svelte";
    import TransferForm from "@components/sections/charms/transfer-charm/TransferForm.svelte";
    import SpellViewer from "@components/sections/charms/transfer-charm/SpellViewer.svelte";
    import TransactionViewer from "@components/sections/charms/transfer-charm/TransactionViewer.svelte";
    import SignedTransactionViewer from "@components/sections/charms/transfer-charm/SignedTransactionViewer.svelte";

    export let charm: ProcessedCharm;
    export let show: boolean = false;
    export let onClose: () => void;

    let transferAmount: number = 55342;
    let destinationAddress: string =
        "tb1qfmdy2ek8j3uga4q76td3ka2dhmwrag3jwhppd9";
    let logMessages: string[] = [];
    let currentAddress: string = "";
    let commitTxHex: string | null = null;
    let spellTxHex: string | null = null;
    let signedCommitTx: SignedTransaction | null = null;
    let signedSpellTx: SignedTransaction | null = null;
    $: signedCommitTx;
    $: signedSpellTx;
    import type { TransferCharmsResponse } from "@app-types/transaction";
    let result: TransferCharmsResponse | null = null;

    // Get the current wallet address
    wallet.subscribe((w) => {
        if (w) {
            currentAddress = w.address;
        }
    });

    $: if (transferAmount > charm.amount) {
        transferAmount = charm.amount;
    }

    let spellTemplate: string = "";
    let finalSpell: string = "";

    // Update spell template whenever inputs change
    $: {
        try {
            // Use the original charm address for return
            spellTemplate = charmsService.composeTransferSpell(
                { ...charm }, // Don't override the original charm address
                transferAmount || 0,
                destinationAddress,
            );
            // Store the valid spell for later use
            if (
                destinationAddress?.trim() &&
                transferAmount > 0 &&
                transferAmount <= charm.amount
            ) {
                finalSpell = spellTemplate;
            }
        } catch (error: any) {
            // Ignore errors during template composition
            console.debug("Spell template composition error:", error);
        }
    }

    /**
     * Validates all required transfer inputs
     * @returns Error message or null if valid
     */
    function validateTransferInputs(): string | null {
        if (!destinationAddress?.trim()) {
            return "Destination address is required";
        }
        if (transferAmount <= 0) {
            return "Amount must be greater than 0";
        }
        if (transferAmount > charm.amount) {
            return "Insufficient charm amount";
        }
        return null;
    }

    /**
     * Adds a message to the log display
     */
    function addLogMessage(message: string): void {
        logMessages = [...logMessages, message];
    }

    /**
     * Creates transactions for charm transfer (step 1 of the transfer process)
     * Validates inputs, generates transactions, and updates UI state
     */
    async function handleCreateTransferTxs() {
        // Input validation
        const validationError = validateTransferInputs();
        if (validationError) {
            logMessages = [...logMessages, validationError];
            return;
        }

        try {
            // Verify spell exists
            if (!finalSpell) {
                throw new Error("Invalid spell template");
            }

            // Log the initiation
            addLogMessage(`Initiating transfer of ${transferAmount} charms...`);

            // Create funding ID and call API
            const fundingUtxoId = `${charm.txid}:${charm.outputIndex}`;
            const response = await createTransferCharmTxs(
                destinationAddress,
                transferAmount,
                finalSpell,
                fundingUtxoId,
            );

            // Store results for next step
            result = response;
            commitTxHex = response.transactions.commit_tx;
            spellTxHex = response.transactions.spell_tx;

            // Success message
            addLogMessage(`Transfer successful! Transactions ready to sign.`);
        } catch (error: any) {
            addLogMessage(`Transfer failed: ${error.message || error}`);
        }
    }

    async function signAndBroadcastTxs() {
        console.log("signAndBroadcastTxs called");
        if (
            !result?.transactions?.commit_tx ||
            !result?.transactions?.spell_tx
        ) {
            logMessages = [...logMessages, "No transactions to sign"];
            return;
        }

        try {
            logMessages = [
                ...logMessages,
                "Starting transaction signing and broadcasting process...",
            ];

            // Get current wallet
            const currentWallet = $wallet;
            if (!currentWallet?.private_key) {
                throw new Error("No wallet available");
            }

            // Sign both transactions
            const {
                signedCommitTx: signedCommitResult,
                signedSpellTx: signedSpellResult,
            } = await signTransactionService.signBothTransactions(
                {
                    ...result.transactions,
                    taproot_data: result.transactions.taproot_data,
                },
                currentWallet.private_key,
                (message) => {
                    logMessages = [...logMessages, message];
                },
            );

            signedCommitTx = signedCommitResult;
            signedSpellTx = signedSpellResult;
            commitTxHex = null;
            spellTxHex = null;

            // Broadcast the signed transactions
            const { commitData, spellData } =
                await broadcastTransactionService.broadcastBothTransactions(
                    signedCommitTx,
                    signedSpellTx,
                    (message) => {
                        logMessages = [...logMessages, message];
                    },
                );

            // Update the charm object with the transaction IDs
            charm = {
                ...charm,
                commitTxId: commitData.txid,
                spellTxId: spellData.txid,
            };

            // Update the charms store with the updated charm object
            charms.updateCharm(charm);

            // Store transactions in localStorage
            localStorage.setItem(
                "commitTransaction",
                JSON.stringify(signedCommitTx),
            );
            localStorage.setItem(
                "spellTransaction",
                JSON.stringify(signedSpellTx),
            );

            // Clear the signed transactions
            signedCommitTx = null;
            signedSpellTx = null;

            console.log("Transfer process completed successfully");
        } catch (error: any) {
            console.error("Error in signAndBroadcastTxs:", error);
            logMessages = [
                ...logMessages,
                `Transaction failed: ${error.message || error}`,
            ];
        }
    }

    function handleClose() {
        logMessages = [];
        transferAmount = 0;
        commitTxHex = null;
        spellTxHex = null;
        result = null;
        signedCommitTx = null;
        signedSpellTx = null;
        onClose();
    }
</script>

<Modal {show} onClose={handleClose}>
    <div class="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
        <h3 class="text-lg font-semibold leading-6 text-gray-900 mb-4">
            Charms Transfer
        </h3>

        <CharmInfo {charm} {transferAmount} />

        <TransferForm {charm} bind:transferAmount bind:destinationAddress />

        <div class="border-t border-gray-200 my-4"></div>

        <SpellViewer {spellTemplate} {logMessages} />

        {#if (commitTxHex || spellTxHex) && !signedCommitTx && !signedSpellTx}
            <TransactionViewer
                title="Commit Transaction"
                transactionHex={commitTxHex || ""}
            />
            <TransactionViewer
                title="Spell Transaction"
                transactionHex={spellTxHex || ""}
            />
        {/if}

        {#if signedCommitTx || signedSpellTx}
            <SignedTransactionViewer
                title="Signed Commit Transaction"
                transaction={signedCommitTx}
            />
            <SignedTransactionViewer
                title="Signed Spell Transaction"
                transaction={signedSpellTx}
            />
        {/if}
    </div>

    <div
        class="bg-gray-50 px-4 py-3 sm:flex sm:flex-row sm:justify-end sm:px-6"
    >
        <button
            type="button"
            on:click={handleClose}
            class="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto mr-2"
        >
            Close
        </button>
        {#if commitTxHex && spellTxHex}
            <button
                type="button"
                on:click={signAndBroadcastTxs}
                class="inline-flex justify-center rounded-md border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
                Sign & Broadcast Transactions
            </button>
        {:else}
            <button
                type="button"
                on:click={handleCreate2txs}
                class="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
                Create transfer Txs
            </button>
        {/if}
    </div>
</Modal>
