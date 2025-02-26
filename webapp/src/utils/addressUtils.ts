import { ec as EC } from 'elliptic';
const ec = new EC('secp256k1');

export function deriveAddress(publicKey: string, index: number): string {
  // Using first 20 bytes of public key and index to generate a unique pattern
  const pubKeyBytes = new Uint8Array(
    publicKey.slice(0, 40).match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
  );
  
  // Include index in derivation to make it unique
  const indexBytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    indexBytes[i] = (index >> (i * 8)) & 0xff;
  }
  
  // Combine pubkey and index for uniqueness
  const combined = new Uint8Array(pubKeyBytes.length + indexBytes.length);
  combined.set(pubKeyBytes);
  combined.set(indexBytes, pubKeyBytes.length);
  
  // Create deterministic pattern for testnet address
  let addressChars = '';
  for (let i = 0; i < 32; i++) {
    const idx = combined[i % combined.length] % 36;
    addressChars += '0123456789abcdefghijklmnopqrstuvwxyz'[idx];
  }
  
  return `tb1q${addressChars}`;
}

export function validateAddress(address: string): boolean {
  return /^tb1q[a-z0-9]{32,}$/.test(address);
}