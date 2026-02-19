// Node.js polyfills for browser environment
import { Buffer } from 'buffer';

// Make Buffer available globally
globalThis.Buffer = Buffer;
window.Buffer = Buffer;

// Also set up process if needed
if (typeof globalThis.process === 'undefined') {
  globalThis.process = { env: {} };
}
