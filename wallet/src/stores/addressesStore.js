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
            console.error('Error loading addresses:', error);
        }
    };

    // Add a new address
    const addAddress = async (address) => {
        try {
            const newAddresses = await addStorageAddress(address);
            setAddresses(newAddresses);
        } catch (error) {
            console.error('Error adding address:', error);
        }
    };

    // Delete an address
    const deleteAddress = async (addressToDelete) => {
        try {
            const newAddresses = await deleteStorageAddress(addressToDelete);
            setAddresses(newAddresses);
        } catch (error) {
            console.error('Error deleting address:', error);
        }
    };

    // Clear all addresses
    const clearAddresses = async () => {
        try {
            await clearStorageAddresses();
            setAddresses([]);
        } catch (error) {
            console.error('Error clearing addresses:', error);
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
