'use client';

/**
 * HeaderAccountMenu — top-right account / profile dropdown.
 *
 * Standard crypto-wallet pattern (MetaMask / Phantom / Trust):
 *   - Avatar / passkey-status button opens a popover
 *   - Popover contains: identity row, settings, security info, recovery
 *     phrase, lock, delete wallet
 *   - Network / blockchain selectors stay separate (already in header)
 *
 * The menu owns its modals so the dashboard body doesn't have to.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/stores/walletStore';
import { useAuth } from '@/contexts/AuthContext';
import SettingsDialog from '@/components/wallet/dashboard/components/SettingsDialog';
import SecurityStatusDialog from '@/components/system/SecurityStatusDialog';
import DeleteWalletDialog from '@/components/system/DeleteWalletDialog';

export default function HeaderAccountMenu() {
  const { hasWallet, seedPhrase } = useWallet();
  const { status, lockNow } = useAuth();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef(null);

  const [showSettings, setShowSettings] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const enrolled = status === 'unlocked' || status === 'locked'; // 'unsupported'/'checking' → no lock
  // Only show "Lock" as actionable when a passkey is actually configured.
  // status === 'unlocked' alone doesn't tell us; the migration banner /
  // settings dialog distinguish further. For a minimal correct signal,
  // check session storage of the auth blob existence via context.
  // (AuthContext already gates UnlockGate so if status is unsupported we
  // know there's no blob; otherwise treat lock as available.)
  const canLock = status !== 'unsupported';

  const toggle = () => {
    if (!btnRef.current) return setOpen(v => !v);
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    setOpen(v => !v);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      if (e.target.closest?.('.header-account-menu-portal')) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const onLock = () => {
    setOpen(false);
    if (canLock) lockNow();
  };

  const goWalletInfo = () => {
    setOpen(false);
    router.push('/wallet-information');
  };
  const goSetupInstructions = () => {
    setOpen(false);
    router.push('/wallet-setup-instructions');
  };

  if (!hasWallet) return null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-dark-700/70 hover:bg-dark-700 border border-dark-600 text-sm text-white"
        title="Account"
      >
        <span className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-blue-500 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </span>
        <svg className="h-4 w-4 text-dark-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {mounted && open && createPortal(
        <div
          className="header-account-menu-portal fixed w-64 rounded-lg shadow-xl bg-dark-800 ring-1 ring-white/10 z-[100000]"
          style={{ top: pos.top, right: pos.right }}
        >
          <div className="px-4 py-3 border-b border-dark-700">
            <p className="text-xs text-dark-400">Status</p>
            <p className="text-sm text-white mt-0.5 flex items-center gap-2">
              {status === 'unlocked' && <span className="w-2 h-2 rounded-full bg-green-500"></span>}
              {status === 'locked'   && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
              {status === 'unsupported' && <span className="w-2 h-2 rounded-full bg-yellow-500"></span>}
              {status === 'unlocked' && 'Unlocked'}
              {status === 'locked'   && 'Locked'}
              {status === 'unsupported' && 'No passkey (plaintext)'}
              {status === 'checking' && 'Loading…'}
            </p>
          </div>

          <MenuButton label="Wallet information"     onClick={goWalletInfo}     icon="info" />
          <MenuButton label="Setup instructions"     onClick={goSetupInstructions} icon="doc" />
          <MenuButton label="Security"               onClick={() => { setOpen(false); setShowSecurity(true); }} icon="shield" />
          <MenuButton label="Settings"               onClick={() => { setOpen(false); setShowSettings(true); }} icon="gear" />

          <div className="border-t border-dark-700 my-1" />

          <MenuButton
            label={canLock ? 'Lock wallet' : 'Lock (enable passkey first)'}
            onClick={onLock}
            disabled={!canLock || status === 'locked'}
            icon="lock"
          />
          <MenuButton
            label="Delete wallet"
            onClick={() => { setOpen(false); setShowDelete(true); }}
            icon="trash"
            danger
          />
        </div>,
        document.body
      )}

      <SettingsDialog isOpen={showSettings} onClose={() => setShowSettings(false)} />
      <SecurityStatusDialog
        isOpen={showSecurity}
        onClose={() => setShowSecurity(false)}
        hasWallet={hasWallet}
        seedPhrase={seedPhrase}
      />
      <DeleteWalletDialog isOpen={showDelete} onClose={() => setShowDelete(false)} />
    </>
  );
}

function MenuButton({ label, onClick, icon, danger, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-dark-200 hover:bg-dark-700/70'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <MenuIcon name={icon} />
      <span>{label}</span>
    </button>
  );
}

function MenuIcon({ name }) {
  const props = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'info':   return <svg {...props}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>;
    case 'doc':    return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
    case 'shield': return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
    case 'gear':   return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    case 'lock':   return <svg {...props}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
    case 'trash':  return <svg {...props}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></svg>;
    default: return null;
  }
}
