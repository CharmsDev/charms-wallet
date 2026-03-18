import { useState, useEffect } from 'react';
import { useBlockchain, BLOCKCHAINS } from '@/stores/blockchainStore';

export function useNetworkDropdown() {
    const {
        activeBlockchain,
        activeNetwork,
        saveBlockchain,
        saveNetwork,
        getAvailableNetworks,
        isBitcoin,
        isCardano,
    } = useBlockchain();

    const [networkDropdownOpen, setNetworkDropdownOpen] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    const handleBlockchainSelect = (blockchain) => saveBlockchain(blockchain);

    const handleNetworkSelect = (network) => {
        saveNetwork(network);
        setNetworkDropdownOpen(false);
    };

    const handleDropdownToggle = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setDropdownPosition({
            top: rect.bottom + 8,
            right: window.innerWidth - rect.right,
        });
        setNetworkDropdownOpen(!networkDropdownOpen);
    };

    const availableNetworks = getAvailableNetworks();

    const getNetworkDisplayName = () => {
        const network = availableNetworks.find(n => n.id === activeNetwork);
        return network ? network.name : activeNetwork;
    };

    const getBlockchainClass = (blockchain) => {
        if (blockchain === activeBlockchain) {
            return blockchain === BLOCKCHAINS.BITCOIN
                ? 'bg-bitcoin-500/20 text-bitcoin-400 bitcoin-glow-text'
                : 'bg-cardano-500/20 text-cardano-400 cardano-glow-text';
        }
        return 'bg-dark-700/30 text-dark-400 hover:bg-dark-700/50';
    };

    return {
        activeBlockchain,
        activeNetwork,
        mounted,
        networkDropdownOpen,
        dropdownPosition,
        availableNetworks,
        isBitcoin,
        isCardano,
        handleBlockchainSelect,
        handleNetworkSelect,
        handleDropdownToggle,
        getNetworkDisplayName,
        getBlockchainClass,
    };
}
