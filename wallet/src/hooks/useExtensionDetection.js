import { useState, useEffect } from 'react';

/**
 * Hook to detect if Charms Wallet Chrome extension is installed
 * @returns {Object} { isInstalled, version, isChecking }
 */
export function useExtensionDetection() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [version, setVersion] = useState(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let timeoutId;

    const handleMessage = (event) => {
      if (event.source !== window) return;

      if (
        event.data.type === 'CHARMS_WALLET_EXTENSION_READY' ||
        event.data.type === 'CHARMS_WALLET_EXTENSION_DETECTED'
      ) {
        setIsInstalled(true);
        setVersion(event.data.version);
        setIsChecking(false);
        clearTimeout(timeoutId);
      }
    };

    window.addEventListener('message', handleMessage);

    // Send check message
    window.postMessage({ type: 'CHARMS_WALLET_CHECK_EXTENSION' }, '*');

    // Timeout after 2 seconds if no response
    timeoutId = setTimeout(() => {
      setIsChecking(false);
    }, 2000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(timeoutId);
    };
  }, []);

  return { isInstalled, version, isChecking };
}
