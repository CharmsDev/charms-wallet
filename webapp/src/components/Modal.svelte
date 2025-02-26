<script lang="ts">
  export let show: boolean = false;
  export let onClose: () => void;
</script>

{#if show}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black bg-opacity-50 transition-opacity z-[9998]"
    on:click={onClose}
  />

  <!-- Modal -->
  <div class="fixed inset-0 z-[9999] overflow-y-auto">
    <div
      class="flex min-h-full items-center justify-center p-4 text-center sm:p-0"
    >
      <div
        class="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-[51.2rem]"
        on:click|stopPropagation={() => {}}
      >
        <slot />
      </div>
    </div>
  </div>
{/if}
