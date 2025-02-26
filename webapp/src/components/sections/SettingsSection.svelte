<script lang="ts">
  import { apiUrl, saveApiUrl } from "@stores/settings";

  let currentUrl = $apiUrl;

  function handleSubmit() {
    saveApiUrl(currentUrl);
  }
</script>

<div class="bg-white shadow rounded-lg p-6">
  <h2 class="text-2xl font-bold mb-4">Settings</h2>

  <form class="max-w-xl" on:submit|preventDefault={handleSubmit}>
    <div class="mb-4">
      <label for="apiUrl" class="block text-sm font-medium text-gray-700 mb-1">
        Charms API URL
      </label>
      <div class="flex gap-2">
        <input
          type="text"
          id="apiUrl"
          bind:value={currentUrl}
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
        />
        <button
          type="submit"
          class="mt-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Save
        </button>
      </div>
    </div>
  </form>
</div>
