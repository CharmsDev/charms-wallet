<script lang="ts">
    export let signatures: string[];
</script>

<div class="border-t border-gray-200 pt-4">
    <h4 class="text-sm font-medium text-gray-900">Signatures</h4>
    <div class="mt-2 bg-gray-50 p-3 rounded-md overflow-x-auto">
        <div class="space-y-2">
            {#each signatures as signature, i}
                <div class="text-xs text-gray-600">
                    <span class="font-medium">Input {i + 1}:</span>
                    <div class="ml-4 break-all">
                        {signature}
                    </div>
                </div>
            {/each}
        </div>
    </div>
</div>
