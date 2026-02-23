export const metadata = {
  title: "Privacy Policy – Charms Wallet",
  description: "Privacy Policy for Charms Wallet web app and browser extension",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-dark-950 text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">

        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold gradient-text mb-3">Privacy Policy</h1>
          <p className="text-dark-400 text-sm">Last updated: February 2026</p>
        </div>

        <div className="space-y-10 text-dark-200 leading-relaxed">

          {/* Intro */}
          <section>
            <p>
              Charms Wallet is a self-custodial Bitcoin wallet available as a web application and as a
              browser extension for Chrome. This Privacy Policy explains what data we collect, how we
              use it, and your rights as a user.
            </p>
          </section>

          {/* 1 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. Self-Custody &amp; Local Storage</h2>
            <p>
              Your seed phrase and private keys are generated and stored exclusively on your device —
              in your browser&apos;s local storage or the extension&apos;s secure storage. They are
              never transmitted to our servers or any third party. You are solely responsible for
              keeping your seed phrase safe.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. Data We Do Not Collect</h2>
            <p>We do not collect, store, or have access to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-dark-300">
              <li>Your seed phrase or private keys</li>
              <li>Your wallet addresses or transaction history</li>
              <li>Any personally identifiable information</li>
              <li>Passwords or biometric data</li>
            </ul>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. Network Requests</h2>
            <p>
              To display balances and broadcast transactions, the wallet communicates with public
              Bitcoin infrastructure including our own Charms Explorer API, QuickNode, and
              Mempool.space. These requests include Bitcoin addresses and transaction data as required
              by the Bitcoin protocol. We do not log or store these requests on our end.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Analytics</h2>
            <p>
              The Charms Wallet web application uses Google Analytics to collect anonymous usage
              statistics (page views, session duration, browser type). No wallet addresses or
              financial data are included in these analytics events. You can opt out via your
              browser&apos;s standard privacy controls or a browser extension that blocks analytics.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Browser Extension</h2>
            <p>
              The Charms Wallet browser extension injects a script into pages on{" "}
              <span className="text-bitcoin-400">charms.dev</span> and{" "}
              <span className="text-bitcoin-400">charms.sh</span> to enable wallet connectivity.
              The extension only activates on those domains. It does not read, modify, or transmit
              any data from other websites you visit. All signing operations happen locally inside
              the extension; private keys never leave your device.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Third-Party Services</h2>
            <p>
              We use the following third-party services solely for wallet functionality:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-dark-300">
              <li>
                <span className="text-white font-medium">Charms Explorer API</span> — balance and
                UTXO lookups, transaction broadcast
              </li>
              <li>
                <span className="text-white font-medium">QuickNode</span> — transaction broadcast
                fallback
              </li>
              <li>
                <span className="text-white font-medium">Mempool.space</span> — transaction broadcast
                fallback
              </li>
              <li>
                <span className="text-white font-medium">CoinGecko</span> — BTC price data
              </li>
            </ul>
            <p className="mt-3">
              Each of these services has its own privacy policy. We encourage you to review them.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">7. Cookies</h2>
            <p>
              We do not use cookies for tracking or advertising. The web application may store
              functional data (such as network preferences) in your browser&apos;s local storage to
              improve your experience.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will be reflected by the
              updated date at the top of this page. Continued use of the wallet after changes
              constitutes acceptance of the revised policy.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">9. Contact</h2>
            <p>
              If you have questions about this Privacy Policy, you can reach us at{" "}
              <a
                href="https://charms.dev"
                className="text-bitcoin-400 hover:text-bitcoin-300 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                charms.dev
              </a>
              .
            </p>
          </section>

        </div>

        {/* Back link */}
        <div className="mt-16 pt-8 border-t border-dark-700/50">
          <a
            href="/"
            className="text-dark-400 hover:text-bitcoin-400 transition-colors text-sm flex items-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Back to Wallet
          </a>
        </div>

      </div>
    </div>
  );
}
