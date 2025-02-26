<script lang="ts">
    export let title: string;
    import type { SignedTransaction } from "@app-types/transaction";

    export let transaction: SignedTransaction | null;

    function formatTxHex(hex: string): string {
        const chunkSize = 64;
        const chunks = hex.match(new RegExp(`.{1,${chunkSize}}`, "g")) || [];
        return chunks.join("\n");
    }
</script>

{#if transaction}
    <div class="mt-4">
        <h4 class="text-sm font-medium text-gray-700 mb-2">{title}</h4>
        <div
            class="bg-gray-50 rounded-md p-3 h-24 overflow-y-auto font-mono text-xs"
        >
            <p class="text-gray-700 whitespace-pre">
                {formatTxHex(transaction.hex)}
            </p>
            <p class="text-gray-700 mt-2">
                Hash: {transaction.hash}<br />
                Signature: {transaction.signature}
            </p>
        </div>
    </div>
{/if}
