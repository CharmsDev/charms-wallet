<!-- src/components/UTXOList.svelte -->
<script lang="ts">
  import { utxos, totalBalance, confirmedBalance } from "@stores/utxos";
  import { addresses } from "@stores/addresses";
  import { walletApi } from "@services/wallet";
  import { onMount } from "svelte";

  let loading = false;
  let error = "";

  async function refreshUTXOs() {
    if ($addresses.length === 0) return;

    loading = true;
    error = "";
    try {
      const addressList = $addresses.map((addr) => addr.address);
      await utxos.fetchUTXOs(addressList);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to fetch UTXOs";
    } finally {
      loading = false;
    }
  }

  $: if ($addresses.length > 0) {
    refreshUTXOs();
  }

  onMount(() => {
    if ($addresses.length > 0) {
      refreshUTXOs();
    }
  });
</script>

<details open class="bg-white rounded-lg shadow-sm">
  <summary class="px-6 py-4 cursor-pointer text-sm font-medium text-gray-900">
    Transaction History (UTXOs)
  </summary>
  <div class="px-6 py-4 border-t border-gray-200">
    {#if loading}
      <p class="text-sm text-gray-500">Loading UTXOs...</p>
    {:else if error}
      <p class="text-sm text-red-600">{error}</p>
    {:else}
      <!-- Balance Summary -->
      <div class="mb-4 p-4 bg-gray-50 rounded-md">
        <p class="text-sm font-medium">
          Total Balance: {walletApi.formatSats($totalBalance)} tBTC
        </p>
        <p class="text-sm text-gray-500">
          Confirmed: {walletApi.formatSats($confirmedBalance)} tBTC
        </p>
      </div>

      <!-- UTXO List -->
      {#each Object.entries($utxos) as [address, addressUtxos]}
        <div class="mb-4">
          <h4 class="text-sm font-medium text-gray-700 mb-2">
            Address: {address}
          </h4>
          <div class="space-y-2">
            {#each addressUtxos as utxo}
              <div class="bg-gray-50 rounded p-3 text-xs font-mono">
                <p>txid: {utxo.txid}</p>
                <p>vout: {utxo.vout}</p>
                <p>
                  value: {walletApi.formatSats(utxo.value)} tBTC ({utxo.value}
                  sats)
                </p>
                {#if utxo.status}
                  <p>confirmed: {utxo.status.confirmed ? "yes" : "no"}</p>
                  {#if utxo.status.block_height}
                    <p>block: {utxo.status.block_height}</p>
                  {/if}
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}

      {#if Object.keys($utxos).length === 0}
        <div class="text-sm text-gray-500 bg-gray-50 p-4 rounded">
          No UTXOs available. When you receive bitcoin, they will appear here.
        </div>
      {/if}
    {/if}
  </div>
</details>
