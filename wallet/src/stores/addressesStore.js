'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { getAddresses, addAddress as addStorageAddress, deleteAddress as deleteStorageAddress, clearAddresses as clearStorageAddresses } from '@/services/storage';

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

    // Load addresses on mount
    useEffect(() => {
        loadAddresses();
    }, []);

    // Load addresses from storage
    const loadAddresses = async () => {
        try {
            const storedAddresses = await getAddresses();
            setAddresses(storedAddresses);
        } catch (error) {
            // Error loading addresses
        }
    };

    // Add a new address
    const addAddress = async (address) => {
        try {
            const newAddresses = await addStorageAddress(address);
            setAddresses(newAddresses);
        } catch (error) {
            // Error adding address
        }
    };

    // Delete an address
    const deleteAddress = async (addressToDelete) => {
        try {
            const newAddresses = await deleteStorageAddress(addressToDelete);
            setAddresses(newAddresses);
        } catch (error) {
            // Error deleting address
        }
    };

    // Clear all addresses
    const clearAddresses = async () => {
        try {
            await clearStorageAddresses();
            setAddresses([]);
        } catch (error) {
            // Error clearing addresses
        }
    };

    // Context value
    const value = {
        addresses,
        addAddress,
        deleteAddress,
        loadAddresses,
        clearAddresses
    };

    return <AddressesContext.Provider value={value}>{children}</AddressesContext.Provider>;
}
