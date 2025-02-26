<script lang="ts">
  import { wallet } from "@stores/wallet";
  import { addresses } from "@stores/addresses";
  import { totalBalance, confirmedBalance } from "@stores/utxos";
  import { walletApi } from "@services/wallet";
  import { onMount } from "svelte";
  import ConfirmDialog from "@components/ConfirmDialog.svelte";
  import AddressManager from "@components/sections/wallet/AddressManager.svelte";
  import UTXOList from "@components/sections/wallet/UTXOList.svelte";
  import TransferDialog from "@components/sections/wallet/transfer-btc/TransferBtcDialog.svelte";

  let showPrivateKey = false;
  let showClearConfirm = false;
  let showTransferDialog = false;

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  }

  function handleClearWallet() {
    showClearConfirm = true;
  }

  function confirmClear() {
    wallet.clear();
    addresses.clear();
    showClearConfirm = false;
  }

  function downloadWallet() {
    if (!$wallet) return;

    const walletDetails = {
      address: $wallet.address,
      publicKey: $wallet.public_key,
      privateKey: $wallet.private_key,
      addresses: $addresses,
    };

    const jsonString = JSON.stringify(walletDetails, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wallet_details.json";
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="space-y-6">
  <!-- Balance Card -->
  <div class="bg-white rounded-xl shadow-sm overflow-hidden">
    <div class="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-8 sm:p-10">
      <div class="space-y-2">
        <h3 class="text-xl font-medium text-white">Current Balance</h3>
        <p class="text-4xl font-bold text-white">
          {walletApi.formatSats($totalBalance)} tBTC
        </p>
        {#if $totalBalance !== $confirmedBalance}
          <p class="text-sm text-blue-100">
            Pending: {walletApi.formatSats($totalBalance - $confirmedBalance)}
            tBTC
          </p>
        {/if}
      </div>
    </div>
  </div>

  <!-- Wallet Details -->
  {#if $wallet}
    <div class="bg-white rounded-lg shadow-sm divide-y divide-gray-200">
      <div class="p-6">
        <h3 class="text-lg font-medium text-gray-900">Wallet Details</h3>
        <div class="mt-4 space-y-4">
          <!-- Public Key Section -->
          <div>
            <label
              for="wallet-public-key"
              class="block text-sm font-medium text-gray-700">Public Key</label
            >
            <div class="mt-1 flex rounded-md shadow-sm">
              <div class="relative flex-grow">
                <input
                  id="wallet-public-key"
                  type="text"
                  readonly
                  value={$wallet.public_key}
                  class="block w-full pr-10 border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <button
                type="button"
                class="ml-3 inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                on:click={() => copyToClipboard($wallet.public_key)}
              >
                Copy
              </button>
            </div>
          </div>

          <!-- Private Key Section -->
          <div>
            <label
              for="wallet-private-key"
              class="block text-sm font-medium text-gray-700">Private Key</label
            >
            <div class="mt-1 flex rounded-md shadow-sm">
              <div class="relative flex-grow">
                <input
                  id="wallet-private-key"
                  type={showPrivateKey ? "text" : "password"}
                  readonly
                  value={$wallet.private_key}
                  class="block w-full pr-10 border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <button
                type="button"
                class="ml-3 inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                on:click={() => copyToClipboard($wallet.private_key)}
              >
                Copy
              </button>
              <button
                type="button"
                class="ml-2 inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                on:click={() => (showPrivateKey = !showPrivateKey)}
              >
                {showPrivateKey ? "Hide" : "Show"}
              </button>
            </div>
            <p class="mt-1 text-sm text-red-600">
              Never share your private key with anyone!
            </p>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="px-6 py-4 bg-gray-50">
        <div class="flex justify-between">
          <button
            type="button"
            class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            on:click={() => (showTransferDialog = true)}
          >
            Send Bitcoin
          </button>
          <div class="flex gap-2">
            <button
              type="button"
              on:click={downloadWallet}
              class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-500 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Download Wallet
            </button>
            <button
              type="button"
              on:click={handleClearWallet}
              class="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-800 hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              Clear Wallet
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Testnet Addresses -->
  {#if $wallet}
    <div class="bg-white rounded-lg shadow-sm">
      <div class="p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-4">
          Testnet Addresses
        </h3>
        <AddressManager />
      </div>
    </div>
  {/if}

  <!-- Transaction History -->
  {#if $wallet}
    <div class="bg-white rounded-lg shadow-sm">
      <div class="p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-4">
          Transaction History
        </h3>
        <UTXOList />
      </div>
    </div>
  {/if}
</div>

<ConfirmDialog
  isOpen={showClearConfirm}
  title="Clear Wallet"
  message="Are you sure you want to clear this wallet? This action cannot be undone."
  onConfirm={confirmClear}
  onCancel={() => (showClearConfirm = false)}
/>

<TransferDialog
  isOpen={showTransferDialog}
  onClose={() => (showTransferDialog = false)}
/>
