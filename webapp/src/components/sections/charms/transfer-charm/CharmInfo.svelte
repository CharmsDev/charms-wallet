<script lang="ts">
    import type { ProcessedCharm } from "@app-types/charms";
    import placeholderImage from "@/assets/placeholder.jpg";

    export let charm: ProcessedCharm;
    export let transferAmount: number;
</script>

<div class="mb-6 bg-gray-50 rounded-lg p-4">
    <div class="flex items-start justify-between">
        <div class="space-y-2">
            <h4 class="text-sm font-medium text-gray-900">
                Charm #{charm.id}
            </h4>
            <p class="text-sm text-gray-500">
                Available Amount: <span class="font-medium text-gray-900"
                    >{(
                        charm.amount - (transferAmount || 0)
                    ).toLocaleString()}</span
                >
            </p>
            <p class="text-xs text-gray-400">
                Total: {charm.amount.toLocaleString()}
            </p>
        </div>
        <div class="w-16 h-16 bg-white rounded-lg overflow-hidden">
            <img
                src={placeholderImage}
                alt="Charm"
                class="w-full h-full object-contain"
            />
        </div>
    </div>
</div>
