<script lang="ts">
    import { decodeTx } from "@utils/txDecoder";

    export let transactionHex: string | null;
    export let title: string;

    function formatTxHex(hex: string): string {
        const chunkSize = 64;
        const chunks = hex.match(new RegExp(`.{1,${chunkSize}}`, "g")) || [];
        return chunks.join("\n");
    }
</script>

<div class="mt-4">
    <h4 class="text-sm font-medium text-gray-700 mb-2">{title}</h4>
    <div
        class="bg-gray-50 rounded-md p-3 h-48 overflow-y-auto font-mono text-xs"
    >
        <div class="mb-2">
            <h5 class="text-xs font-medium text-gray-600 mb-1">
                Raw Transaction Hex:
            </h5>
            <p class="text-gray-700 whitespace-pre overflow-x-auto">
                {formatTxHex(transactionHex || "")}
            </p>
        </div>
        {#if transactionHex}
            <div>
                <h5 class="text-xs font-medium text-gray-600 mb-1">
                    Decoded Transaction:
                </h5>
                <p class="text-gray-700 whitespace-pre overflow-x-auto">
                    {@html (() => {
                        try {
                            const decoded = decodeTx(transactionHex);
                            return decoded
                                ? `<pre>${JSON.stringify(decoded, null, 2)}</pre>`
                                : "Error decoding transaction";
                        } catch (error) {
                            console.error("Error decoding transaction:", error);
                            return "Error decoding transaction";
                        }
                    })()}
                </p>
            </div>
        {/if}
    </div>
</div>
