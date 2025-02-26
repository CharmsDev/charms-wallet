<!-- src/components/CreateWallet.svelte -->
<script lang="ts">
  import { wallet } from "@stores/wallet";
  import { walletApi } from "@services/wallet";
  import CryptoJS from "crypto-js";

  let mode: "create" | "import" = "create";
  let password = "";
  let confirmPassword = "";
  let importKey = "";
  let loading = false;
  let error = "";
  let step = 1;
  let passwordStrength = 0;

  function checkPasswordStrength(pwd: string): number {
    let s = 0;
    if (pwd.length >= 8) s++;
    if (/[a-z]+/.test(pwd)) s++;
    if (/[A-Z]+/.test(pwd)) s++;
    if (/[0-9]+/.test(pwd)) s++;
    if (/[^a-zA-Z0-9]+/.test(pwd)) s++;
    return s;
  }

  $: passwordStrength = password ? checkPasswordStrength(password) : 0;
  function getStrengthColor(s: number): string {
    return s <= 2 ? "bg-red-500" : s <= 3 ? "bg-yellow-500" : "bg-green-500";
  }

  async function handleCreate() {
    loading = true;
    error = "";
    try {
      if (step === 1) {
        if (passwordStrength < 3) {
          error = "Please use a stronger password";
          loading = false;
          return;
        }
        step = 2;
        loading = false;
        return;
      }

      // Only check password match in step 2
      if (password !== confirmPassword) {
        error = "Passwords do not match";
        loading = false;
        return;
      }

      // Revalidate password strength before final submission
      if (passwordStrength < 3) {
        error = "Password strength has been compromised";
        step = 1;
        loading = false;
        return;
      }

      const newWallet = await walletApi.createWallet(password);

      // Encrypt the wallet with the user's password before storing
      const encrypted = CryptoJS.AES.encrypt(
        JSON.stringify(newWallet),
        password,
      ).toString();

      // Store encrypted version for secure storage
      localStorage.setItem("encrypted_wallet", encrypted);

      // Update the wallet store for active use
      wallet.setWallet(newWallet);

      // Clear sensitive data
      password = "";
      confirmPassword = "";
    } catch (e) {
      error = "Failed to create wallet";
      console.error(e);
    } finally {
      loading = false;
    }
  }

  async function handleImport() {
    loading = true;
    error = "";
    try {
      if (!importKey) {
        error = "Please paste your private key";
        loading = false;
        return;
      }
      const importedWallet = await walletApi.importWallet(importKey);
      if (!importedWallet) {
        error = "Invalid private key";
        loading = false;
        return;
      }
      localStorage.setItem("bitcoin_wallet", JSON.stringify(importedWallet));
      wallet.setWallet(importedWallet);
      importKey = "";
    } catch (e) {
      // Show the actual error message
      error = e instanceof Error ? e.message : "Failed to import wallet";
      console.error("Import error:", e);
    } finally {
      loading = false;
    }
  }
</script>

<div class="max-w-md mx-auto">
  <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
    <div class="flex justify-center space-x-4 mb-6">
      <button
        on:click={() => {
          mode = "create";
          error = "";
          password = "";
          confirmPassword = "";
          step = 1;
        }}
        class={`px-4 py-2 rounded ${mode === "create" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700"}`}
      >
        Create Wallet
      </button>
      <button
        on:click={() => {
          mode = "import";
          error = "";
          password = "";
          confirmPassword = "";
          importKey = "";
        }}
        class={`px-4 py-2 rounded ${mode === "import" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700"}`}
      >
        Import Wallet
      </button>
    </div>
    {#if mode === "create"}
      <div class="space-y-6">
        <div class="flex justify-between mb-8">
          <div class="relative w-full">
            <div class="absolute top-2 w-full h-0.5 bg-gray-200">
              <div
                class="absolute h-0.5 bg-blue-500 transition-all duration-500"
                style="width: {step === 1 ? '50%' : '100%'}"
              ></div>
            </div>
            <div class="relative flex justify-between">
              <div class="flex flex-col items-center">
                <div
                  class="rounded-full h-5 w-5 bg-blue-500 flex items-center justify-center"
                >
                  <span class="text-white text-xs">1</span>
                </div>
                <span class="mt-2 text-xs text-gray-500">Create Password</span>
              </div>
              <div class="flex flex-col items-center">
                <div
                  class={`rounded-full h-5 w-5 flex items-center justify-center ${step === 2 ? "bg-blue-500" : "bg-gray-200"}`}
                >
                  <span
                    class={`text-xs ${step === 2 ? "text-white" : "text-gray-500"}`}
                    >2</span
                  >
                </div>
                <span class="mt-2 text-xs text-gray-500">Confirm Password</span>
              </div>
            </div>
          </div>
        </div>
        <form on:submit|preventDefault={handleCreate} class="space-y-6">
          {#if step === 1}
            <div>
              <label
                for="password"
                class="block text-sm font-medium text-gray-700"
                >Create Password</label
              >
              <div class="mt-1">
                <input
                  id="password"
                  type="password"
                  bind:value={password}
                  required
                  class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Enter a strong password"
                />
              </div>
              <div class="mt-2">
                <div
                  class="flex h-1.5 rounded-full bg-gray-200 overflow-hidden"
                >
                  {#each Array(5) as _, i}
                    <div
                      class="w-1/5 h-full transition-colors duration-300 {i <
                      passwordStrength
                        ? getStrengthColor(passwordStrength)
                        : ''}"
                    ></div>
                  {/each}
                </div>
                <p class="mt-1 text-xs text-gray-500">
                  Password strength:
                  {#if passwordStrength <= 2}
                    <span class="text-red-500">Weak</span>
                  {:else if passwordStrength <= 3}
                    <span class="text-yellow-500">Medium</span>
                  {:else}
                    <span class="text-green-500">Strong</span>
                  {/if}
                </p>
              </div>
              <ul class="mt-2 text-xs text-gray-500 list-disc list-inside">
                <li>At least 8 characters</li>
                <li>Include uppercase & lowercase letters</li>
                <li>Include numbers and special characters</li>
              </ul>
            </div>
          {:else}
            <div>
              <label
                for="confirm-password"
                class="block text-sm font-medium text-gray-700"
                >Confirm Password</label
              >
              <div class="mt-1">
                <input
                  id="confirm-password"
                  type="password"
                  bind:value={confirmPassword}
                  required
                  class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Confirm your password"
                />
              </div>
            </div>
          {/if}
          {#if error}
            <div class="rounded-md bg-red-50 p-4">
              <div class="flex">
                <div class="ml-3">
                  <h3 class="text-sm font-medium text-red-800">{error}</h3>
                </div>
              </div>
            </div>
          {/if}
          <div class="flex items-center justify-between">
            {#if step === 2}
              <button
                type="button"
                on:click={() => {
                  step = 1;
                  error = "";
                  confirmPassword = ""; // Clear confirm password when going back
                }}
                class="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Back
              </button>
            {:else}
              <div></div>
            {/if}
            <button
              type="submit"
              disabled={loading}
              class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
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
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  ></path>
                </svg>
              {/if}
              {loading
                ? "Creating..."
                : step === 1
                  ? "Continue"
                  : "Create Wallet"}
            </button>
          </div>
        </form>
      </div>
    {:else}
      <div class="space-y-6">
        <form on:submit|preventDefault={handleImport} class="space-y-6">
          <div>
            <label
              for="private-key"
              class="block text-sm font-medium text-gray-700">Private Key</label
            >
            <div class="mt-1">
              <textarea
                id="private-key"
                bind:value={importKey}
                required
                rows="3"
                class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Paste your private key here"
              ></textarea>
            </div>
          </div>
          {#if error}
            <div class="rounded-md bg-red-50 p-4">
              <div class="flex">
                <div class="ml-3">
                  <h3 class="text-sm font-medium text-red-800">{error}</h3>
                </div>
              </div>
            </div>
          {/if}
          <div class="flex items-center justify-end">
            <button
              type="submit"
              disabled={loading}
              class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
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
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  ></path>
                </svg>
              {/if}
              {loading ? "Importing..." : "Import Wallet"}
            </button>
          </div>
        </form>
      </div>
    {/if}
  </div>
</div>
