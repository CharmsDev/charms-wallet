'use client';

import { createContext, useContext, useState } from 'react';

const NavigationContext = createContext();

export function NavigationProvider({ children }) {
    const [activeSection, setActiveSection] = useState('wallets');
    const [loadedSections, setLoadedSections] = useState(new Set(['wallets']));

    const handleSectionChange = (section) => {
        setActiveSection(section);
        setLoadedSections(prev => new Set([...prev, section]));
    };

    return (
        <NavigationContext.Provider value={{ 
            activeSection, 
            setActiveSection: handleSectionChange,
            loadedSections 
        }}>
            {children}
        </NavigationContext.Provider>
    );
}

export function useNavigation() {
    const context = useContext(NavigationContext);
    if (!context) {
        throw new Error('useNavigation must be used within NavigationProvider');
    }
    return context;
}
