'use client';

import SetupShell from './SetupShell';

/**
 * Method choice for "Create new wallet". Two cards with the gancho
 * of each path. Password card is hidden when PRF is supported and we
 * want to push the user to passkey by default — pero lo dejamos como
 * link discreto "Use a password instead" para no esconder la opción.
 */
export default function ChoosePathStep({ prfSupported, onPasskey, onPassword, onBack }) {
  return (
    <SetupShell title="How do you want to secure this wallet?">
      {prfSupported && (
        <PathCard
          accent="primary"
          label="Use a passkey"
          tagline="100% security. Your passkey IS the wallet — biometric sign-in across every device where it's available."
          recommended
          onClick={onPasskey}
        />
      )}

      <PathCard
        accent="dark"
        label="Use a password"
        tagline={
          prfSupported
            ? 'Universal fallback. Works in every browser; your browser saves it like any other login.'
            : 'Universal. Works in this browser; your browser saves it like any other login.'
        }
        onClick={onPassword}
      />

      <button onClick={onBack} className="text-xs text-dark-400 hover:text-dark-200 underline w-full text-center">
        ← Back
      </button>
    </SetupShell>
  );
}

function PathCard({ accent, label, tagline, onClick, recommended }) {
  const base = accent === 'primary'
    ? 'bg-gradient-to-r from-primary-500 to-blue-500 hover:opacity-90'
    : 'bg-dark-700 hover:bg-dark-600';
  return (
    <button onClick={onClick} className={`w-full text-left p-4 rounded-xl ${base} text-white`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold">{label}</span>
        {recommended && <span className="text-[10px] uppercase tracking-wide opacity-80">Recommended</span>}
      </div>
      <p className="text-xs opacity-90 mt-1 leading-relaxed">{tagline}</p>
    </button>
  );
}
