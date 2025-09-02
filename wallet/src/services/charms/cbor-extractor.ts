/**
 * Provides low-level utilities for extracting `app_public_inputs` from CBOR data
 * found within Bitcoin transaction witnesses. This is used as a fallback mechanism
 * when `charms-js` cannot fully decode the APP ID.
 */
import * as bitcoin from 'bitcoinjs-lib';

// Minimal CBOR reader focusing on text strings and maps
function readUint(data: Buffer, offset: number, bytes: number): { value: number; next: number } {
  let val = 0;
  for (let i = 0; i < bytes; i++) {
    val = (val << 8) | data[offset + i];
  }
  return { value: val, next: offset + bytes };
}

function readLength(additional: number, data: Buffer, offset: number): { length: number; next: number } {
  if (additional < 24) return { length: additional, next: offset };
  if (additional === 24) {
    const { value, next } = readUint(data, offset, 1);
    return { length: value, next };
  }
  if (additional === 25) {
    const { value, next } = readUint(data, offset, 2);
    return { length: value, next };
  }
  if (additional === 26) {
    const { value, next } = readUint(data, offset, 4);
    return { length: value, next };
  }
  throw new Error('Unsupported CBOR length additional info: ' + additional);
}

type CborValue = string | number | boolean | null | CborMap | CborArray;
interface CborMap { [k: string]: CborValue }
interface CborArray extends Array<CborValue> {}

function decodeItem(data: Buffer, offset: number): { value: CborValue; next: number } {
  if (offset >= data.length) throw new Error('CBOR decode out of range');
  const ib = data[offset];
  const major = ib >> 5;
  const additional = ib & 0x1f;
  let next = offset + 1;

  switch (major) {
    case 0: { // unsigned int
      const { length, next: n1 } = readLength(additional, data, next);
      next = n1;
      return { value: length, next };
    }
    case 1: { // negative int (we don't use value semantics here)
      const { length, next: n1 } = readLength(additional, data, next);
      next = n1;
      return { value: -1 - length, next };
    }
    case 2: { // byte string
      const { length, next: n1 } = readLength(additional, data, next);
      next = n1;
      const end = next + length;
      if (end > data.length) throw new Error('CBOR bytes overruns');
      // Return as hex string for traversal visibility
      const hex = data.subarray(next, end).toString('hex');
      return { value: hex, next: end };
    }
    case 3: { // text string
      const { length, next: n1 } = readLength(additional, data, next);
      next = n1;
      const end = next + length;
      if (end > data.length) throw new Error('CBOR text overruns');
      const str = data.subarray(next, end).toString('utf8');
      return { value: str, next: end };
    }
    case 4: { // array
      const { length, next: n1 } = readLength(additional, data, next);
      next = n1;
      const arr: CborArray = [];
      for (let i = 0; i < length; i++) {
        const d = decodeItem(data, next);
        arr.push(d.value);
        next = d.next;
      }
      return { value: arr, next };
    }
    case 5: { // map
      const { length, next: n1 } = readLength(additional, data, next);
      next = n1;
      const obj: CborMap = {};
      for (let i = 0; i < length; i++) {
        const kDec = decodeItem(data, next);
        next = kDec.next;
        const vDec = decodeItem(data, next);
        next = vDec.next;
        const k = typeof kDec.value === 'string' ? kDec.value : String(kDec.value);
        obj[k] = vDec.value;
      }
      return { value: obj, next };
    }
    case 6: { // tag — consume the tag argument, then decode the tagged item
      const { length: _tagNum, next: n1 } = readLength(additional, data, next);
      // We don't use the tag number, but we must advance past it
      const inner = decodeItem(data, n1);
      return { value: inner.value, next: inner.next };
    }
    case 7: { // simple types / null / bool
      if (additional === 20) return { value: false, next };
      if (additional === 21) return { value: true, next };
      if (additional === 22) return { value: null, next };
      return { value: null, next };
    }
    default:
      throw new Error('Unsupported CBOR major type: ' + major);
  }
}

// Given an index pointing at the first ASCII byte of a CBOR text string,
// find the start index of the text string initial byte (major type 3).
function findTextHeaderStart(data: Buffer, asciiIndex: number): number | null {
  if (asciiIndex <= 0) return null;
  const b1 = data[asciiIndex - 1];
  // Short form: single initial byte 0x60..0x77 (length < 24)
  if (b1 >= 0x60 && b1 <= 0x77) {
    return asciiIndex - 1;
  }
  // One-byte length form: 0x78 <len>
  if (asciiIndex >= 2) {
    const b2 = data[asciiIndex - 2];
    if (b2 === 0x78) return asciiIndex - 2;
  }
  // Two-byte length form: 0x79 <len16_hi> <len16_lo>
  if (asciiIndex >= 3) {
    const b3 = data[asciiIndex - 3];
    if (b3 === 0x79) return asciiIndex - 3;
  }
  // Four-byte length form: 0x7a <len32_4..1>
  if (asciiIndex >= 5) {
    const b5 = data[asciiIndex - 5];
    if (b5 === 0x7a) return asciiIndex - 5;
  }
  return null;
}

// Decode app_public_inputs value right after its text key.
function decodeAppPublicInputsValue(data: Buffer, valueOffset: number): string | undefined {
  try {
    const vDec = decodeItem(data, valueOffset);
    const v = vDec.value as any;

    // Case 1: already a string like 't,....'
    if (typeof v === 'string' && v.startsWith('t,')) return v;

    // Utility to convert a 32-byte hex string (64 hex chars) to decimal list
    const hexToDecList = (hex: string): number[] => {
      const arr: number[] = [];
      for (let i = 0; i < hex.length; i += 2) {
        arr.push(parseInt(hex.slice(i, i + 2), 16));
      }
      return arr;
    };

    // Case 2: array ['t', <bytes32>, <bytes32>], where bytes32 can be array of numbers or hex string
    if (Array.isArray(v) && v.length >= 3 && v[0] === 't') {
      const partToNums = (p: any): number[] | null => {
        if (Array.isArray(p)) {
          if (p.length === 32) return p.map((x) => (typeof x === 'number' ? x : Number(x)));
          return null;
        }
        if (typeof p === 'string') {
          // Expect hex string from CBOR byte string decode
          if (p.length === 64) return hexToDecList(p);
          return null;
        }
        return null;
      };
      const n1 = partToNums(v[1]);
      const n2 = partToNums(v[2]);
      if (n1 && n1.length === 32 && n2 && n2.length === 32) {
        return `t,${n1.join(',')},${n2.join(',')}`;
      }
    }

    // Case 3: value is a map encoding with entries like {'t': [32], <k2>: [32]} or similar
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const arrays: number[][] = [];
      // Prefer the 't' key array first if present
      const maybeT = (v as any)['t'];
      const toNums = (p: any): number[] | null => {
        if (Array.isArray(p) && p.length === 32) return p.map((x) => (typeof x === 'number' ? x : Number(x)));
        if (typeof p === 'string' && p.length === 64) return hexToDecList(p);
        return null;
      };
      const tArr = toNums(maybeT);
      if (tArr) arrays.push(tArr);
      // Then collect other 32-len arrays from map values in insertion order
      for (const [k, val] of Object.entries(v)) {
        // If a key itself is the t-list string
        if (typeof k === 'string' && k.startsWith('t,')) return k;
        const nums = toNums(val as any);
        if (nums) {
          // Avoid duplicating the 't' array if we already added it
          if (!tArr || nums.join(',') !== tArr.join(',')) arrays.push(nums);
        } else if (typeof (val as any) === 'string' && (val as string).startsWith('t,')) {
          return val as string;
        }
        if (arrays.length >= 2) break;
      }
      if (arrays.length >= 2) {
        const [n1, n2] = arrays;
        return `t,${n1.join(',')},${n2.join(',')}`;
      }
    }
  } catch {}
  return undefined;
}

function tryExtractAppPublicInputsFromBuffer(buf: Buffer): string | undefined {
  try {
    // Expect either array or map containing the spell and app_public_inputs
    const walk = (val: CborValue): string | undefined => {
      if (!val) return undefined;
      if (typeof val === 'string') {
        // If text starts with t, it's likely the candidate itself
        if (val.startsWith('t,')) return val;
        return undefined;
      }
      if (Array.isArray(val)) {
        for (const el of val) {
          const got = walk(el);
          if (got) return got;
        }
        return undefined;
      }
      if (typeof val === 'object') {
        const m = val as CborMap;
        if (typeof m['app_public_inputs'] === 'string') {
          return m['app_public_inputs'] as string;
        }
        // Sometimes value is a map whose key is the t-list string
        const maybe = m['app_public_inputs'];
        if (maybe && typeof maybe === 'object') {
          for (const [k] of Object.entries(maybe as CborMap)) {
            if (k.startsWith('t,')) return k;
          }
        }
        // Walk nested
        for (const v of Object.values(m)) {
          const got = walk(v);
          if (got) return got;
        }
      }
      return undefined;
    };
    // Try decode at multiple offsets in the buffer to find embedded CBOR
    const maxAttempts = buf.length; // scan full buffer; witnesses are small
    for (let off = 0; off < maxAttempts; off++) {
      try {
        const { value } = decodeItem(buf, off);
        const got = walk(value);
        if (got) return got;
      } catch {
        // ignore and continue scanning
      }
    }
    // Fallback: regex scan UTF-8 for a decimal 't,' list of at least 64 numbers
    try {
      const text = buf.toString('utf8');
      const m = text.match(/t,(?:\d+,){63,}\d+/);
      if (m && m[0]) return m[0];
    } catch {}
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extracts `app_public_inputs` from a raw transaction hex.
 * It inspects the witness data of each input, searching for CBOR-encoded spell data
 * that contains the `app_public_inputs` field. This is a heuristic-based approach.
 *
 * @param txHex - The raw transaction hex string.
 * @returns A map where keys are vout indices and values are the stringified `app_public_inputs`.
 *          Currently, it only maps to vout 0 as a common case.
 */
export function extractAppInputsByVout(txHex: string): Map<number, string> {
  const out = new Map<number, string>();
  try {
    const tx = bitcoin.Transaction.fromHex(txHex);
    
    for (let vin = 0; vin < tx.ins.length; vin++) {
      const wstack: Buffer[] = (tx as any).ins[vin]?.witness || [];
      if (!wstack) continue;

      for (const w of wstack) {
        const hexHead = w.subarray(0, Math.min(16, w.length)).toString('hex');
        
        // Heuristic: Look for witness items that are large enough and contain "spell" in hex.
        if (w.length > 600 && hexHead.includes('7370656c6c')) { // "spell"
          // Attempt to extract from the buffer using a general CBOR walk.
          const val = tryExtractAppPublicInputsFromBuffer(w);
          if (val && val.startsWith('t,')) {
            // Assume vout 0 for single-output mints.
            if (!out.has(0)) out.set(0, val);
            break; // Found it for this input, move to the next.
          }
          
          // Fallback: search for the literal "app_public_inputs" hex pattern.
          const hexString = w.toString('hex');
          const appInputsHex = '6170705f7075626c69635f696e70757473'; // "app_public_inputs"
          const appInputsIndex = hexString.indexOf(appInputsHex);

          if (appInputsIndex >= 0) {
            try {
              const asciiByteIndex = Math.floor(appInputsIndex / 2);
              const headerStart = findTextHeaderStart(w, asciiByteIndex);
              if (headerStart === null) continue;

              const kDec = decodeItem(w, headerStart);
              if (typeof kDec.value === 'string' && kDec.value === 'app_public_inputs') {
                const precise = decodeAppPublicInputsValue(w, kDec.next);
                if (precise && precise.startsWith('t,')) {
                  if (!out.has(0)) out.set(0, precise);
                  break; // Found it.
                }
              }
            } catch {}
          }
        }
      }
    }
  } catch (e) {
    // Silently fail on transaction parsing errors.
  }
  return out;
}
