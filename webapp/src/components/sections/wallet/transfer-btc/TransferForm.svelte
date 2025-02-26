<script lang="ts">
    export let amount: string;
    export let address: string;
    export let error: string;
    export let isLoading: boolean;
    export let isSigningMode: boolean;
    export let signedTx: string | null;
    export let onSubmit: () => void;
    export let onSign: () => void;
    export let onBroadcast: () => void;
    export let onCancel: () => void;
</script>

<form class="space-y-4" on:submit|preventDefault={onSubmit}>
    {#if !isSigningMode}
        <div>
            <label for="amount" class="block text-sm font-medium text-gray-700">
                Amount (BTC)
            </label>
            <div class="mt-1">
                <input
                    type="number"
                    step="any"
                    id="amount"
                    bind:value={amount}
                    class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    placeholder="0.0"
                    disabled={isLoading}
                />
            </div>
        </div>

        <div>
            <label
                for="address"
                class="block text-sm font-medium text-gray-700"
            >
                Recipient Address
            </label>
            <div class="mt-1">
                <input
                    type="text"
                    id="address"
                    bind:value={address}
                    class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    placeholder="tb1..."
                    disabled={isLoading}
                />
            </div>
        </div>
    {/if}

    {#if error}
        <p class="text-sm text-red-600">{error}</p>
    {/if}

    <div class="flex justify-end gap-2">
        <button
            type="button"
            on:click={onCancel}
            class="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            disabled={isLoading}
        >
            Cancel
        </button>

        {#if !isSigningMode}
            <button
                type="submit"
                class="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                disabled={isLoading}
            >
                {#if isLoading}
                    <svg
                        class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            class="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            stroke-width="4"
                        />
                        <path
                            class="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                    </svg>
                    Processing...
                {:else}
                    Create Transaction
                {/if}
            </button>
        {:else if !signedTx}
            <button
                type="button"
                on:click={onSign}
                class="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                disabled={isLoading}
            >
                {#if isLoading}
                    <svg
                        class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            class="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            stroke-width="4"
                        />
                        <path
                            class="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                    </svg>
                    Signing...
                {:else}
                    Sign Transaction
                {/if}
            </button>
        {:else}
            <button
                type="button"
                on:click={onBroadcast}
                class="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                disabled={isLoading}
            >
                {#if isLoading}
                    <svg
                        class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            class="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            stroke-width="4"
                        />
                        <path
                            class="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                    </svg>
                    Broadcasting...
                {:else}
                    Broadcast Transaction
                {/if}
            </button>
        {/if}
    </div>
</form>
