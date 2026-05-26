import "./globals.css";
import MainLayout from "@/components/layout/MainLayout";
import { WalletProvider } from "@/stores/walletStore";
import { NetworkProvider } from "@/contexts/NetworkContext";
import { NavigationProvider } from "@/contexts/NavigationContext";
import { UTXOProvider } from "@/stores/utxoStore";
import { CharmsProvider } from "@/stores/charmsStore";
import { BeamOperationsProvider } from "@/contexts/BeamOperationsContext";
import { AuthProvider } from "@/contexts/AuthContext";
import UpgradeGate from "@/components/system/UpgradeGate";
import UnlockGate from "@/components/system/UnlockGate";
import MigrationGate from "@/components/system/MigrationGate";
import ExtensionTopBanner from "@/components/extension/ExtensionTopBanner";
import Script from 'next/script';

export const metadata = {
  title: "Multi-Chain Wallet with Charms",
  description: "A secure and user-friendly Bitcoin and Cardano wallet with Charms integration",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ExtensionTopBanner />
        <UpgradeGate>
          <WalletProvider>
            {/* AuthProvider mounts inside WalletProvider so it can hydrate
                seedPhrase after a successful passkey unlock. UnlockGate
                blocks everything below it (network, UTXOs, dashboard…)
                while status='locked'. Non-enrolled / unsupported users
                see no overlay. */}
            <AuthProvider>
              <UnlockGate>
                <MigrationGate>
                <NetworkProvider>
                  <NavigationProvider>
                    <UTXOProvider>
                      <CharmsProvider>
                        <BeamOperationsProvider>
                          <MainLayout>
                            {children}
                          </MainLayout>
                        </BeamOperationsProvider>
                      </CharmsProvider>
                    </UTXOProvider>
                  </NavigationProvider>
                </NetworkProvider>
                </MigrationGate>
              </UnlockGate>
            </AuthProvider>
          </WalletProvider>
        </UpgradeGate>
        <Script
          strategy="afterInteractive"
          src="https://www.googletagmanager.com/gtag/js?id=G-TPDZFQH9CV"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-TPDZFQH9CV');
          `}
        </Script>
      </body>
    </html>
  );
}
