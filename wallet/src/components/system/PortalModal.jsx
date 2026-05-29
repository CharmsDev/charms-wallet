'use client';

/**
 * PortalModal — shared shell for dialogs spawned from the header
 * account menu. Renders via createPortal to document.body so the
 * dialog escapes parent stacking contexts (notably the header's
 * `backdrop-filter: blur` which would otherwise trap fixed-positioned
 * descendants inside the header strip — see the original portal trap
 * notes in the auth-code-conventions doc).
 *
 * Layout: full-viewport overlay (dimmed), centered card on tablet+ /
 * top-anchored with scroll on mobile so the modal title isn't covered
 * by a small phone's URL bar.
 *
 * Accent: 'neutral' (default, white border) or 'danger' (red border)
 * — used by the destructive Delete dialog.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const ACCENT_BORDER = {
  neutral: 'border-white/20',
  danger:  'border-red-500/30',
};

export default function PortalModal({ isOpen, onClose, title, accent = 'neutral', closable = true, children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-start sm:items-center justify-center z-[10001] overflow-y-auto py-20 sm:py-12">
      <div className={`bg-dark-900 rounded-lg w-full max-w-lg mx-4 my-auto border ${ACCENT_BORDER[accent]}`}>
        {(title || closable) && (
          <div className="flex justify-between items-center px-6 pt-6 pb-3">
            {title && (
              <h2 className={`text-xl font-semibold ${accent === 'danger' ? 'text-red-400' : 'gradient-text'}`}>
                {title}
              </h2>
            )}
            {closable && (
              <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="px-6 pb-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}
