/**
 * Charms Store - Backward Compatibility Layer
 * 
 * Re-exports from the new Zustand store
 */

'use client';

export { useCharmsStore } from './charms';
export { useCharms } from './charms/hooks';

// Dummy Provider for backward compatibility
export function CharmsProvider({ children }) {
    return children;
}
