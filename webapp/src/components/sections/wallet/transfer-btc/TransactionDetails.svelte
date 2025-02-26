<script lang="ts">
    import { utxoService } from "@services/wallet";
    import type { TxDetails } from "@app-types/transaction";

    export let transaction: TxDetails;
</script>

<div class="border-t border-gray-200 pt-4">
    <h4 class="text-sm font-medium text-gray-900">Transaction Details</h4>
    <div class="mt-2 space-y-2">
        <div class="bg-gray-50 p-3 rounded-md">
            <div class="space-y-1">
                <p class="text-sm text-gray-600">
                    <span class="font-medium">Inputs:</span>
                    {#each transaction.inputs as input}
                        <div class="ml-4 text-xs">
                            • {input.txid} ({utxoService.formatSats(
                                input.value,
                            )} BTC)
                        </div>
                    {/each}
                </p>
                <p class="text-sm text-gray-600">
                    <span class="font-medium">Outputs:</span>
                    {#each transaction.outputs as output}
                        <div class="ml-4 text-xs">
                            • {utxoService.formatSats(output.value)} BTC to {output.address}
                        </div>
                    {/each}
                </p>
                <p class="text-sm text-gray-600">
                    <span class="font-medium">Fee:</span>
                    {utxoService.formatSats(transaction.fee)} BTC
                </p>
            </div>
        </div>
    </div>
</div>
