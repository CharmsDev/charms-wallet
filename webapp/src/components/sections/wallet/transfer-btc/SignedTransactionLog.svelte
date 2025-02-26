<script lang="ts">
    export let signedTx: string;
</script>

<div class="border-t border-gray-200 pt-4">
    <h4 class="text-sm font-medium text-gray-900">Signed Transaction</h4>
    <div class="mt-2 bg-gray-50 p-3 rounded-md overflow-x-auto">
        <pre class="text-xs text-gray-600">{JSON.stringify(
                JSON.parse(signedTx),
                null,
                2,
            )}</pre>
    </div>
</div>
