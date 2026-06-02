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
import ServiceWorkerRegister from "@/components/system/ServiceWorkerRegister";
import Script from 'next/script';

export const metadata = {
  title: "Charms Wallet",
  description: "Bitcoin + Cardano wallet with Charms and passkey unlock.",
  manifest: "/manifest.json",
  themeColor: "#0a0a0a",
  appleWebApp: {
    capable: true,
    title: "Charms",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegister />
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
