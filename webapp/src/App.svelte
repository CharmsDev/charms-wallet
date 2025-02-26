<script lang="ts">
  import { wallet } from "@stores/wallet";
  import MainLayout from "@components/layout/MainLayout.svelte";
  import CreateWallet from "@components/sections/wallet/CreateWallet.svelte";
  import WalletSection from "@components/sections/WalletSection.svelte";
</script>

<MainLayout>
  {#if !$wallet}
    <CreateWallet />
  {:else}
    <WalletSection />
  {/if}
</MainLayout>
