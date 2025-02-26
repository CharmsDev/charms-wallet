<script lang="ts">
  import type { ProcessedCharm } from "@app-types/charms";
  import placeholderImage from "@/assets/placeholder.jpg";
  import { transferDialog } from "@stores/transfer";

  export let charm: ProcessedCharm;
  let showDetails = false;

  function formatAppName(app: string): string {
    const [type, path] = app.split("/");
    return type === "n" ? "NFT" : "Token";
  }

  function getTypeColor(app: string): string {
    const type = app.split("/")[0];
    return type === "n"
      ? "bg-purple-100 text-purple-800"
      : "bg-green-100 text-green-700";
  }
</script>

<div
  class="bg-white rounded-lg shadow-md overflow-hidden transform transition-all duration-200 hover:shadow-lg w-[70%] mx-auto"
>
  <div class="relative w-full pb-[70%] bg-white border-b border-gray-200">
    <div class="absolute inset-0 p-6">
      <img
        src={placeholderImage}
        alt="Charm"
        class="w-full h-full object-contain rounded-lg"
      />
    </div>
    <div class="absolute top-2 right-2 flex space-x-2">
      <span
        class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getTypeColor(
          charm.app,
        )}"
      >
        {formatAppName(charm.app)}
      </span>
      <span
        class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
      >
        Active
      </span>
    </div>
  </div>
  <div class="p-4">
    <div class="flex justify-between items-start">
      <div>
        <h3 class="text-lg font-semibold text-gray-900">
          Charm #{charm.id}
        </h3>
        <p class="mt-1 text-sm text-gray-500">
          Output: {charm.outputIndex}
        </p>
        {#if charm.commitTxId || charm.spellTxId}
          <div class="mt-2 flex flex-col gap-2">
            {#if charm.commitTxId}
              <div class="bg-gray-50 px-2 py-1 rounded text-xs">
                <span class="text-gray-500">Commit:</span>
                <span class="font-mono">{charm.commitTxId}</span>
              </div>
            {/if}
            {#if charm.spellTxId}
              <div class="bg-gray-50 px-2 py-1 rounded text-xs">
                <span class="text-gray-500">Spell:</span>
                <span class="font-mono">{charm.spellTxId}</span>
              </div>
            {/if}
          </div>
        {/if}
      </div>
      <span class="text-lg font-medium text-blue-600 tabular-nums">
        {charm.amount.toLocaleString()}
      </span>
    </div>

    <div class="mt-4 flex flex-col space-y-2">
      <button
        class="text-sm text-blue-600 hover:text-blue-800 font-medium text-left transition-colors"
        type="button"
        on:click={() => (showDetails = !showDetails)}
      >
        {showDetails ? "Hide Details ↑" : "Show Details ↓"}
      </button>

      {#if showDetails}
        <div class="mt-2 bg-gray-50 p-3 rounded text-xs font-mono break-all">
          <div class="mb-3">
            <p class="text-gray-600 mb-1">App:</p>
            <p class="text-gray-800">{charm.app}</p>
          </div>
          <div>
            <p class="text-gray-600 mb-1">UTXO:</p>
            <p class="text-gray-800">{charm.txid}</p>
          </div>
        </div>
      {/if}

      <button
        type="button"
        on:click={() => transferDialog.open(charm)}
        class="w-full mt-2 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
      >
        Transfer
      </button>
    </div>
  </div>
</div>
