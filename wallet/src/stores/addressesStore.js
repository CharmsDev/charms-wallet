'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { getAddresses, addAddress as addStorageAddress, addMultipleAddresses as addMultipleStorageAddresses, clearAddresses as clearStorageAddresses } from '@/services/storage';
import { useBlockchain } from '@/stores/blockchainStore';

// Create context
const AddressesContext = createContext();

// Use addresses context
export const useAddresses = () => {
    const context = useContext(AddressesContext);
    if (!context) {
        throw new Error('useAddresses must be used within an AddressesProvider');
    }
    return context;
};

// Provider component
export function AddressesProvider({ children }) {
    const [addresses, setAddresses] = useState([]);
    const { activeBlockchain, activeNetwork, getStorageKeyPrefix } = useBlockchain();

    // Load addresses when blockchain or network changes
    useEffect(() => {
        loadAddresses();
    }, [activeBlockchain, activeNetwork]);

    // Load addresses from storage
    const loadAddresses = async () => {
        try {
            const storedAddresses = await getAddresses(activeBlockchain, activeNetwork);
            setAddresses(storedAddresses);
        } catch (error) {
            // Error loading addresses
            console.error('Error loading addresses:', error);
            setAddresses([]);
        }
    };

    // Add a new address
    const addAddress = async (address) => {
        try {
            // Add blockchain info to the address
            const addressWithBlockchain = {
                ...address,
                blockchain: activeBlockchain
            };

            const newAddresses = await addStorageAddress(addressWithBlockchain, activeBlockchain, activeNetwork);
            setAddresses(newAddresses);
            return newAddresses;
        } catch (error) {
            // Error adding address
            console.error('Error adding address:', error);
            return addresses;
        }
    };

    // Add multiple new addresses
    const addMultipleAddresses = async (newAddresses) => {
        try {
            const addressesWithBlockchain = newAddresses.map(addr => ({
                ...addr,
                blockchain: activeBlockchain
            }));

            const updatedAddresses = await addMultipleStorageAddresses(addressesWithBlockchain, activeBlockchain, activeNetwork);
            setAddresses(updatedAddresses);
            return updatedAddresses;
        } catch (error) {
            console.error('Error adding multiple addresses:', error);
            return addresses;
        }
    };

    // Clear all addresses
    const clearAddresses = async () => {
        try {
            await clearStorageAddresses(activeBlockchain, activeNetwork);
            setAddresses([]);
        } catch (error) {
            // Error clearing addresses
            console.error('Error clearing addresses:', error);
        }
    };

    // Context value
    const value = {
        addresses,
        addAddress,
        addMultipleAddresses,
        loadAddresses,
        clearAddresses
    };

    return <AddressesContext.Provider value={value}>{children}</AddressesContext.Provider>;
}
