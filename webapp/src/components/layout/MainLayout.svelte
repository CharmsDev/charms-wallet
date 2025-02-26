<script lang="ts">
  import { wallet } from "../../stores/wallet";
  import { activeSection } from "../../stores/navigation";
  import { transferDialog } from "../../stores/transfer";
  import CharmsSection from "../sections/CharmsSection.svelte";
  import SettingsSection from "../sections/SettingsSection.svelte";
  import TransferCharmDialog from "@components/sections/charms/TransferCharmDialog.svelte";

  type Section = "wallets" | "charms" | "settings";

  function setSection(section: Section) {
    activeSection.set(section);
  }
</script>

<!-- Main Layout -->
<div class="min-h-screen flex flex-col bg-gray-50 relative">
  <!-- Header -->
  <header class="bg-white shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div class="flex justify-between items-center">
        <!-- Logo -->
        <div class="flex items-center">
          <img
            src="https://charms.dev/_astro/logo-charms-dark.Ceshk2t3.png"
            alt="Charms Logo"
            class="h-8"
          />
          <span class="ml-2 text-xl font-semibold text-gray-900">Wallet</span>
        </div>

        <!-- Network Badge -->
        <div class="flex items-center">
          <span
            class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800"
          >
            Testnet4
          </span>
        </div>
      </div>
    </div>
  </header>

  <!-- Navigation -->
  <nav class="bg-white border-b border-gray-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex space-x-8">
        <button
          class="py-4 px-1 inline-flex items-center border-b-2 {$activeSection ===
          'wallets'
            ? 'border-blue-500 text-blue-600'
            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
          on:click={() => setSection("wallets")}
        >
          Wallets
        </button>
        <button
          class="py-4 px-1 inline-flex items-center border-b-2 {$activeSection ===
          'charms'
            ? 'border-blue-500 text-blue-600'
            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
          on:click={() => setSection("charms")}
        >
          Charms
        </button>
        <button
          class="py-4 px-1 inline-flex items-center border-b-2 {$activeSection ===
          'settings'
            ? 'border-blue-500 text-blue-600'
            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}"
          on:click={() => setSection("settings")}
        >
          Settings
        </button>
      </div>
    </div>
  </nav>

  <!-- Main Content -->
  <main class="flex-grow py-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Wallet Section -->
      <div
        class="transition-opacity duration-200"
        class:opacity-0={$activeSection !== "wallets"}
        class:hidden={$activeSection !== "wallets"}
      >
        {#if !$wallet}
          <div class="text-center max-w-2xl mx-auto">
            <h1 class="text-4xl font-bold text-gray-900 mb-4">
              Welcome to Charms Wallet
            </h1>
            <p class="text-lg text-gray-600 mb-8">
              A secure Bitcoin Testnet4 wallet for your development needs.
            </p>
            <slot />
          </div>
        {:else}
          <slot />
        {/if}
      </div>

      <!-- Charms Section - Always mounted, just hidden -->
      <div
        class="transition-opacity duration-200"
        class:opacity-0={$activeSection !== "charms"}
        class:hidden={$activeSection !== "charms"}
      >
        <CharmsSection />
      </div>

      <!-- Settings Section -->
      <div
        class="transition-opacity duration-200"
        class:opacity-0={$activeSection !== "settings"}
        class:hidden={$activeSection !== "settings"}
      >
        <SettingsSection />
      </div>
    </div>
  </main>

  <!-- Footer -->
  <footer class="bg-white border-t border-gray-200 mt-auto">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div class="flex justify-between items-center">
        <div class="text-sm text-gray-500">
          © 2025 Charms Wallet. All rights reserved.
        </div>
        <div class="text-sm text-gray-500">Version 0.1.0</div>
      </div>
    </div>
  </footer>
</div>

<!-- Transfer Dialog (outside main layout) -->
{#if $transferDialog.isOpen && $transferDialog.charm}
  <TransferCharmDialog
    charm={$transferDialog.charm}
    show={$transferDialog.isOpen}
    onClose={() => transferDialog.close()}
  />
{/if}
