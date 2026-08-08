import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { generateTaprootAddress } from '@/utils/addressUtils';
import { useWallet } from '@/stores/walletStore';
import { StorageAdapter } from '../shared/storage-adapter';

const MAINNET_NETWORK_OBJ = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'bc',
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 0x00,
  scriptHash: 0x05,
  wif: 0x80,
};

export function useReceiveAddress({ activeBlockchain, activeNetwork, addresses, addAddress }) {
  const [receiveAddress, setReceiveAddress] = useState('');
  const [receiveIndex, setReceiveIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // G003: derivation reads the mnemonic from RAM. getSeedPhrase() only ever
  // returns something for a legacy plaintext wallet, so on any current
  // wallet this hook used to throw 'No seed phrase' and the Receive sheet
  // came up blank.
  const { seedPhrase } = useWallet();
  const seedRef = useRef(seedPhrase);
  useEffect(() => { seedRef.current = seedPhrase; }, [seedPhrase]);

  const indexKey = useMemo(
    () => `last_receive_index_${activeBlockchain}_${activeNetwork}`,
    [activeBlockchain, activeNetwork]
  );

  const networkObj = activeNetwork === 'mainnet' ? MAINNET_NETWORK_OBJ : null;

  const ensureAddressSaved = useCallback(async (addr, idx) => {
    const exists = (addresses || []).find(a => a.address === addr);
    if (!exists && addAddress) {
      await addAddress(
        { address: addr, index: idx, isChange: false, created: new Date().toISOString(), blockchain: activeBlockchain },
        activeBlockchain,
        activeNetwork
      );
    }
  }, [addresses, addAddress, activeBlockchain, activeNetwork]);

  const open = useCallback(async () => {
    setIsGenerating(true);
    setCopied(false);
    setError('');
    try {
      const seedPhrase = seedRef.current;
      if (!seedPhrase) throw new Error('Wallet locked. Please unlock and retry.');
      const stored = await StorageAdapter.get(indexKey);
      const idx = stored != null ? Number(stored) : 0;
      setReceiveIndex(idx);
      const addr = await generateTaprootAddress(seedPhrase, idx, false, networkObj);
      setReceiveAddress(addr);
      await ensureAddressSaved(addr, idx);
    } catch (err) {
      console.error('[ReceiveAddress] open error:', err);
      setError(err.message || 'Could not derive a receive address.');
    } finally {
      setIsGenerating(false);
    }
  }, [indexKey, networkObj, ensureAddressSaved]);

  const generateNext = useCallback(async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setCopied(false);
    setError('');
    try {
      const seedPhrase = seedRef.current;
      if (!seedPhrase) throw new Error('Wallet locked. Please unlock and retry.');
      const nextIdx = receiveIndex + 1;
      const addr = await generateTaprootAddress(seedPhrase, nextIdx, false, networkObj);
      await StorageAdapter.set(indexKey, nextIdx);
      setReceiveIndex(nextIdx);
      setReceiveAddress(addr);
      await ensureAddressSaved(addr, nextIdx);
    } catch (err) {
      console.error('[ReceiveAddress] generateNext error:', err);
      setError(err.message || 'Could not derive a receive address.');
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, receiveIndex, indexKey, networkObj, ensureAddressSaved]);

  const copyAddress = useCallback(() => {
    if (!receiveAddress) return;
    navigator.clipboard.writeText(receiveAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [receiveAddress]);

  return { receiveAddress, receiveIndex, isGenerating, copied, error, open, generateNext, copyAddress };
}
