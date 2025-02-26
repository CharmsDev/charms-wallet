<script lang="ts">
    export let spellTemplate: string;
    export let logMessages: string[];
</script>

<div class="mt-4">
    <h4 class="text-sm font-medium text-gray-700 mb-2">Building the spell</h4>
    <div
        class="bg-gray-50 rounded-md p-3 h-48 overflow-y-auto font-mono text-xs"
    >
        <p class="text-gray-700 whitespace-pre mb-3">{spellTemplate}</p>
        {#each logMessages as message}
            <p class="text-gray-700 mb-3 whitespace-pre">
                {message}
            </p>
        {/each}
    </div>
</div>
