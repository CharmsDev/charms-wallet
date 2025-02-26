<script lang="ts">
    import type { ProcessedCharm } from "@app-types/charms";

    export let charm: ProcessedCharm;
    export let transferAmount: number;
    export let destinationAddress: string;
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
            max={charm.amount}
            on:input={(e) => {
                const value = Number(e.currentTarget.value);
                if (value > charm.amount) {
                    e.currentTarget.value = charm.amount.toString();
                    transferAmount = charm.amount;
                }
            }}
            class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
        />
    </div>
</div>
