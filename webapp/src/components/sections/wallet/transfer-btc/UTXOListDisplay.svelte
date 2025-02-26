<script lang="ts">
    import { utxos } from "@stores/utxos";
    import { walletApi } from "@services/wallet";
</script>

<div class="border-t border-gray-200 pt-4">
    <h4 class="text-sm font-medium text-gray-900">Available UTXOs</h4>
    {#if Object.keys($utxos).length === 0}
        <p class="mt-2 text-sm text-gray-500">No UTXOs available</p>
    {:else}
        {#each Object.entries($utxos) as [address, addressUtxos]}
            <div class="mt-4">
                <h5 class="text-xs font-medium text-gray-700">
                    Address: {address}
                </h5>
                <div class="mt-2 space-y-2">
                    {#each addressUtxos as utxo}
                        <div class="bg-gray-50 p-2 rounded-md">
                            <div class="text-xs font-mono">
                                <p>txid: {utxo.txid}</p>
                                <p>vout: {utxo.vout}</p>
                                <p>
                                    value: {walletApi.formatSats(utxo.value)} tBTC
                                    ({utxo.value} sats)
                                </p>
                                {#if utxo.status}
                                    <p>
                                        confirmed: {utxo.status.confirmed
                                            ? "yes"
                                            : "no"}
                                    </p>
                                    {#if utxo.status.block_height}
                                        <p>
                                            block: {utxo.status.block_height}
                                        </p>
                                    {/if}
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/each}
    {/if}
</div>
