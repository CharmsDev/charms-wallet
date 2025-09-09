'use client';

// Re-export from NetworkContext for backward compatibility
export { 
    useNetwork as useBlockchain, 
    NetworkProvider as BlockchainProvider,
    BLOCKCHAINS,
    NETWORKS 
} from '@/contexts/NetworkContext';
