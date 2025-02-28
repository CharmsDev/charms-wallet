<script lang="ts">
    import type { ProcessedCharm } from "@app-types/charms";

    export let charm: ProcessedCharm;
    export let transferAmount: number;
    export let destinationAddress: string;

    // Check if the charm is an NFT (starts with "n/")
    $: isNFT = charm.app.startsWith("n/");

    // For NFTs, set the transfer amount to the remaining amount in the charm
    $: if (isNFT && charm.amount && transferAmount !== charm.amount.remaining) {
        transferAmount = charm.amount.remaining;
    }
</script>

<div class="space-y-4">
    <div>
        <label
            for="address"
            class="block text-sm font-medium text-gray-700 mb-1"
        >
            Destination Address
        </label>
        <input
            type="text"
            id="address"
            bind:value={destinationAddress}
            placeholder="Enter recipient's address"
            class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
        />
    </div>

    {#if isNFT}
        <div class="p-3 bg-gray-50 rounded-md">
            <p class="text-sm font-medium text-gray-700">Transferring 1 NFT</p>
        </div>
    {:else}
        <div>
            <label
                for="amount"
                class="block text-sm font-medium text-gray-700 mb-1"
            >
                Transfer Amount
            </label>
            <input
                type="number"
                id="amount"
                bind:value={transferAmount}
                min="0"
                max={charm.amount?.remaining}
                on:input={(e) => {
                    const value = Number(e.currentTarget.value);
                    if (charm.amount && value > charm.amount.remaining) {
                        e.currentTarget.value =
                            charm.amount.remaining.toString();
                        transferAmount = charm.amount.remaining;
                    }
                }}
                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
        </div>
    {/if}
</div>
