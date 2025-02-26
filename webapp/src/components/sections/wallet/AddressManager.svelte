<script lang="ts">
  import { wallet } from "@stores/wallet";
  import { addresses } from "@stores/addresses";
  import { onMount } from "svelte";
  import ConfirmDialog from "@components/ConfirmDialog.svelte";
  let newCustomAddress = "";
  let addressError = "";
  let addressToDelete: string | null = null;

  function handleDeleteClick(address: string) {
    addressToDelete = address;
  }

  function confirmDelete() {
    if (addressToDelete) {
      addresses.deleteAddress(addressToDelete);
      addressToDelete = null;
    }
  }

  // Bech32 constants
  const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const GENERATOR = [
    0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3,
  ];

  function polymod(values: number[]): number {
    let chk = 1;
    for (let value of values) {
      const top = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ value;
      for (let i = 0; i < 5; i++) {
        if ((top >> i) & 1) {
          chk ^= GENERATOR[i];
        }
      }
    }
    return chk;
  }

  function hrpExpand(hrp: string): number[] {
    const result = [];
    for (let i = 0; i < hrp.length; i++) {
      result.push(hrp.charCodeAt(i) >> 5);
    }
    result.push(0);
    for (let i = 0; i < hrp.length; i++) {
      result.push(hrp.charCodeAt(i) & 31);
    }
    return result;
  }

  function createChecksum(hrp: string, data: number[]): number[] {
    const values = [...hrpExpand(hrp), ...data];
    const mod = polymod([...values, 0, 0, 0, 0, 0, 0]) ^ 1;
    const ret = [];
    for (let p = 0; p < 6; p++) {
      ret.push((mod >> (5 * (5 - p))) & 31);
    }
    return ret;
  }

  async function sha256(data: Uint8Array): Promise<Uint8Array> {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return new Uint8Array(hashBuffer);
  }

  async function ripemd160(data: Uint8Array): Promise<Uint8Array> {
    const hash = await sha256(data);
    return hash.slice(0, 20);
  }

  function convertBits(
    data: Uint8Array,
    fromBits: number,
    toBits: number,
    pad: boolean,
  ): number[] {
    let acc = 0;
    let bits = 0;
    const ret = [];
    const maxv = (1 << toBits) - 1;

    for (let value of data) {
      acc = (acc << fromBits) | value;
      bits += fromBits;
      while (bits >= toBits) {
        bits -= toBits;
        ret.push((acc >> bits) & maxv);
      }
    }

    if (pad && bits > 0) {
      ret.push((acc << (toBits - bits)) & maxv);
    }

    return ret;
  }

  function encode(hrp: string, data: number[]): string {
    const combined = [...data, ...createChecksum(hrp, data)];
    let ret = `${hrp}1`;
    for (let p of combined) {
      ret += CHARSET.charAt(p);
    }
    return ret;
  }

  function validateAddress(address: string): boolean {
    // Separate patterns for each type
    const p2wpkhPattern = /^tb1q[a-z0-9]{38,39}$/;
    const p2trPattern = /^tb1p[a-z0-9]{58,59}$/;

    return p2wpkhPattern.test(address) || p2trPattern.test(address);
  }

  async function addCustomAddress() {
    try {
      if (!newCustomAddress) {
        addressError = "Please enter an address";
        return;
      }

      if (!newCustomAddress.startsWith("tb1")) {
        addressError =
          "Invalid address format: must be a testnet bech32 address (starts with tb1)";
        return;
      }

      const p2wpkhPattern = /^tb1q[a-z0-9]{38,39}$/;
      const p2trPattern = /^tb1p[a-z0-9]{58,59}$/;

      if (
        newCustomAddress.startsWith("tb1q") &&
        !p2wpkhPattern.test(newCustomAddress)
      ) {
        addressError =
          "Invalid SegWit address format (tb1q address length incorrect)";
        return;
      }

      if (
        newCustomAddress.startsWith("tb1p") &&
        !p2trPattern.test(newCustomAddress)
      ) {
        addressError =
          "Invalid Taproot address format (tb1p address length incorrect)";
        return;
      }

      if (!validateAddress(newCustomAddress)) {
        addressError =
          "Invalid address format: must be a valid testnet SegWit (tb1q) or Taproot (tb1p) address";
        return;
      }

      addresses.addAddress({
        address: newCustomAddress,
        index: -1,
        created: new Date().toISOString(),
      });

      newCustomAddress = "";
      addressError = "";
    } catch (error) {
      console.error("Error adding custom address:", error);
      addressError = "Failed to verify address";
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  }

  async function generateNewAddress() {
    if (!$wallet?.public_key) return;

    try {
      const nextIndex = $addresses.length;
      const newAddress = await deriveNewAddress($wallet.public_key, nextIndex);

      // Check if address already exists (shouldn't happen, but better to check)
      if ($addresses.some((addr) => addr.address === newAddress)) {
        console.error("Generated address already exists");
        return;
      }

      addresses.addAddress({
        address: newAddress,
        index: nextIndex,
        created: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error generating new address:", error);
    }
  }

  async function deriveNewAddress(
    publicKey: string,
    index: number,
  ): Promise<string> {
    try {
      const pubKeyBytes = new Uint8Array(
        publicKey.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
      );

      const indexBytes = new Uint8Array([
        (index >> 24) & 0xff,
        (index >> 16) & 0xff,
        (index >> 8) & 0xff,
        index & 0xff,
      ]);

      const combined = new Uint8Array(pubKeyBytes.length + indexBytes.length);
      combined.set(pubKeyBytes);
      combined.set(indexBytes, pubKeyBytes.length);

      const sha256Hash = await sha256(combined);
      const hash160 = await ripemd160(sha256Hash);
      const words = convertBits(hash160, 8, 5, true);
      const witnessVersion = 0;
      const programWords = [witnessVersion, ...words];

      return encode("tb", programWords);
    } catch (error) {
      console.error("Error generating address:", error);
      throw error;
    }
  }

  onMount(async () => {
    if (!$wallet) {
      console.error("No wallet found");
      return;
    }
    addresses.loadAddresses();
  });
</script>

<div class="mt-4 space-y-4">
  <!-- Address List Section -->
  <div>
    <label class="block text-sm font-medium text-gray-700"
      >Testnet Addresses (Native SegWit - bech32/bech32m)</label
    >
    <div class="mt-2 space-y-2">
      {#each $addresses as addr}
        <div
          class="flex items-center justify-between bg-gray-50 p-2 rounded-md"
        >
          <div class="flex-1 font-mono text-sm truncate">
            {addr.address}
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500">
              {addr.index === -1 ? "Custom" : `Index: ${addr.index}`}
            </span>
            <button
              on:click={() => copyToClipboard(addr.address)}
              class="px-3 py-1 text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Copy
            </button>
            <button
              on:click={() => handleDeleteClick(addr.address)}
              class="px-3 py-1 text-xs text-white bg-red-800 hover:bg-red-900 rounded-md"
            >
              Delete
            </button>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- Actions Section -->
  <div class="flex justify-between items-center pt-4">
    <button
      on:click={generateNewAddress}
      class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
    >
      Generate New Address
    </button>
    <div class="flex gap-2 items-center">
      <input
        type="text"
        bind:value={newCustomAddress}
        placeholder="Custom address (tb1q... or tb1p...)"
        class="block w-[40rem] border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
      />
      <button
        on:click={addCustomAddress}
        class="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
      >
        Add
      </button>
    </div>
  </div>
  {#if addressError}
    <p class="mt-1 text-sm text-red-600">{addressError}</p>
  {/if}
</div>

<ConfirmDialog
  isOpen={addressToDelete !== null}
  title="Delete Address"
  message="Are you sure you want to delete this address?"
  onConfirm={confirmDelete}
  onCancel={() => (addressToDelete = null)}
/>
