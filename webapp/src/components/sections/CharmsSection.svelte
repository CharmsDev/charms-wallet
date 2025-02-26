<script lang="ts">
  import { onMount } from "svelte";
  import { charms } from "@stores/charms";
  import { utxos } from "@stores/utxos";
  import CharmCard from "@components/sections/charms/CharmCard.svelte";
  import { activeSection } from "@stores/navigation";

  let loading: boolean;
  charms.loading.subscribe((value: boolean) => (loading = value));

  async function loadCharms() {
    if ($utxos && Object.keys($utxos).length > 0) {
      await charms.loadCharmsFromUTXOs($utxos);
    }
  }

  function handleManualRefresh() {
    if (!loading) {
      loadCharms();
    }
  }

  // Load charms when UTXOs change or when section becomes active
  $: if (
    $utxos &&
    Object.keys($utxos).length > 0 &&
    $activeSection === "charms"
  ) {
    loadCharms();
  }

  onMount(() => {
    if (
      $utxos &&
      Object.keys($utxos).length > 0 &&
      $activeSection === "charms"
    ) {
      loadCharms();
    }
  });
</script>

<div class="space-y-6">
  <div class="flex justify-between items-center">
    <h2 class="text-2xl font-bold text-gray-100">Your Charms</h2>
    <button
      type="button"
      on:click={handleManualRefresh}
      disabled={loading}
      class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
    >
      {#if loading}
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
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        Loading...
      {:else}
        Refresh
      {/if}
    </button>
  </div>

  {#if loading}
    <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {#each Array(3) as _}
        <div class="animate-pulse">
          <div class="bg-gray-700 rounded-lg h-64"></div>
        </div>
      {/each}
    </div>
  {:else if $charms.length === 0}
    <div class="text-center py-12">
      <h3 class="mt-2 text-sm font-medium text-gray-200">No charms found</h3>
      <p class="mt-1 text-sm text-gray-400">
        Get started by acquiring some charms.
      </p>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {#each $charms as charm (charm.uniqueId)}
        <CharmCard {charm} />
      {/each}
    </div>
  {/if}
</div>
