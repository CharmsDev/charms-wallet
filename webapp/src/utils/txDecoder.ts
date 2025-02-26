export function decodeTx(hex: string) {
    // Convert hex to bytes
    const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
    let offset = 0;

    // Read 4 bytes as little-endian number
    const readUInt32LE = () => {
        const value = bytes[offset] +
            (bytes[offset + 1] << 8) +
            (bytes[offset + 2] << 16) +
            (bytes[offset + 3] << 24);
        offset += 4;
        return value;
    };

    // Read variable length integer
    const readVarInt = () => {
        const first = bytes[offset++];
        if (first < 0xfd) return first;
        if (first === 0xfd) {
            const value = bytes[offset] + (bytes[offset + 1] << 8);
            offset += 2;
            return value;
        }
        // For simplicity, we'll assume no huge numbers
        return first;
    };

    // Read bytes of specified length
    const readBytes = (length: number) => {
        const value = bytes.slice(offset, offset + length);
        offset += length;
        return value;
    };

    // Read reverse bytes (for txid)
    const readReversedHex = (length: number) => {
        return Array.from(readBytes(length))
            .reverse()
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    };

    try {
        // Version (4 bytes)
        const version = readUInt32LE();

        // Number of inputs
        const numInputs = readVarInt();
        const inputs = [];

        // Read inputs
        for (let i = 0; i < numInputs; i++) {
            const txid = readReversedHex(32);
            const vout = readUInt32LE();
            const scriptLen = readVarInt();
            const script = readBytes(scriptLen);
            const sequence = readUInt32LE();

            inputs.push({
                txid,
                vout,
                sequence
            });
        }

        // Number of outputs
        const numOutputs = readVarInt();
        const outputs = [];

        // Read outputs
        for (let i = 0; i < numOutputs; i++) {
            const value = readUInt32LE() + (readUInt32LE() * 0x100000000);
            const scriptLen = readVarInt();
            const script = Array.from(readBytes(scriptLen))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');

            outputs.push({
                value,
                scriptPubKey: script
            });
        }

        // Locktime (4 bytes)
        const locktime = readUInt32LE();

        return {
            version,
            inputs,
            outputs,
            locktime
        };
    } catch (error) {
        console.error("Error decoding transaction:", error);
        return null;
    }
}
