'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ExtensionInstallGuide() {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText('chrome://extensions');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Back button */}
      <button
        onClick={() => router.push('/')}
        className="flex items-center gap-1.5 text-dark-400 hover:text-dark-200 transition-colors text-sm mb-6"
      >
        <span className="text-lg">&larr;</span> Back to wallet
      </button>

      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 bg-bitcoin-500/10 border border-bitcoin-500/30 rounded-full px-3.5 py-1 text-xs font-semibold text-bitcoin-400 mb-3">
          <span className="w-2 h-2 rounded-full bg-bitcoin-400 animate-pulse" />
          Manual installation
        </div>
        <h1 className="text-2xl font-bold gradient-text mb-1">Install Charms Wallet</h1>
        <p className="text-dark-400 text-sm">Follow these 3 steps — less than 2 minutes</p>
      </div>

      {/* Step 1 */}
      <StepCard number={1} title="Open the Extensions page">
        <p className="text-dark-400 text-sm mb-3">
          Copy this address and paste it in Chrome's address bar.
        </p>
        <div className="flex items-center gap-2 bg-dark-800 rounded-lg border border-dark-600 px-3 py-2">
          <code className="flex-1 font-mono text-sm text-bitcoin-400">chrome://extensions</code>
          <button
            onClick={handleCopy}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
              copied
                ? 'bg-green-500/15 border-green-500/40 text-green-400'
                : 'bg-dark-700 border-dark-600 text-dark-200 hover:bg-dark-600'
            }`}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-dark-500 text-xs mt-2">
          After pasting, press <strong className="text-dark-200">Enter</strong>.
        </p>
      </StepCard>

      {/* Step 2 */}
      <StepCard number={2} title="Enable Developer Mode">
        <p className="text-dark-400 text-sm mb-3">
          Find the switch in the <strong className="text-dark-200">top right corner</strong> and turn it on.
        </p>
        <div className="flex items-center justify-center gap-3 bg-dark-800 rounded-lg border border-dark-600 px-4 py-3.5">
          <span className="text-sm text-dark-400">Developer mode</span>
          <div className="w-11 h-6 rounded-full bg-bitcoin-500 relative">
            <div className="w-4.5 h-4.5 rounded-full bg-white absolute top-[3px] left-[23px]" style={{ width: 18, height: 18 }} />
          </div>
          <span className="text-xs font-semibold text-green-400">It should look like this</span>
        </div>
        <p className="text-dark-500 text-xs mt-2.5">
          When enabled, three new buttons appear. You need <strong className="text-dark-200">"Load unpacked"</strong>.
        </p>
      </StepCard>

      {/* Step 3 */}
      <StepCard number={3} title="Download and install">
        <p className="text-dark-400 text-sm mb-3.5">
          Download the file, unzip it, then load it in Chrome.
        </p>
        <a
          href="/extension/charms-wallet-extension.zip"
          download
          className="inline-flex items-center gap-2 bg-bitcoin-500 text-black font-bold px-6 py-3 rounded-lg text-sm hover:bg-bitcoin-400 transition-colors mb-4"
        >
          Download extension (.zip)
        </a>
        <div className="bg-dark-800 rounded-lg border border-dark-600 p-4 space-y-1.5">
          <SubStep num="a" text='Unzip the .zip file into a folder' />
          <SubStep num="b" text='In Chrome, click "Load unpacked"' />
          <SubStep num="c" text='Select the unzipped folder and click "Select Folder"' />
        </div>
      </StepCard>

      {/* Done */}
      <div className="text-center p-8 glass-effect rounded-xl border border-dark-600 mt-6">
        <div className="text-4xl mb-2">&#10003;</div>
        <h2 className="text-lg font-semibold mb-1.5">Done!</h2>
        <p className="text-dark-400 text-sm">
          The extension should now appear in your Chrome toolbar. Refresh this page to continue.
        </p>
      </div>

      {/* Help */}
      <p className="text-center text-dark-500 text-xs mt-6">
        Need help? Contact us at <strong className="text-dark-300">support@charms.dev</strong>
      </p>
    </div>
  );
}

function StepCard({ number, title, children }) {
  return (
    <div className="flex gap-4 mb-6 glass-effect rounded-xl border border-dark-600 p-5">
      <div className="min-w-9 h-9 rounded-full bg-bitcoin-500/15 border border-bitcoin-500/30 flex items-center justify-center font-bold text-bitcoin-400 text-sm flex-shrink-0">
        {number}
      </div>
      <div className="flex-1">
        <h3 className="text-base font-semibold mb-2">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function SubStep({ num, text }) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <span className="min-w-5 h-5 rounded-full bg-dark-700 flex items-center justify-center text-[0.65rem] font-bold text-dark-400">
        {num}
      </span>
      <span className="text-sm text-dark-400">{text}</span>
    </div>
  );
}
