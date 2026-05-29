'use client';

/**
 * SetupShell — common chrome for every wizard step (fixed overlay,
 * card, title). Keeps the step components focused on their content.
 */

export default function SetupShell({ title, children }) {
  return (
    <div className="fixed inset-0 z-[10000] bg-dark-950/95 backdrop-blur-sm flex items-start sm:items-center justify-center overflow-y-auto py-12">
      <div className="w-full max-w-md mx-4 my-auto bg-dark-900 rounded-2xl border border-white/10 p-6 sm:p-8 space-y-6">
        {title && <h1 className="text-2xl font-bold gradient-text text-center">{title}</h1>}
        {children}
      </div>
    </div>
  );
}
