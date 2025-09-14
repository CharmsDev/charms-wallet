import "./globals.css";
import MainLayout from "@/components/layout/MainLayout";
import { WalletProvider } from "@/stores/walletStore";
import { NetworkProvider } from "@/contexts/NetworkContext";
import { UTXOProvider } from "@/stores/utxoStore";
import { CharmsProvider } from "@/stores/charmsStore";
import { WasmProvider } from "@/contexts/WasmContext";
import Script from 'next/script';

export const metadata = {
  title: "Multi-Chain Wallet with Charms",
  description: "A secure and user-friendly Bitcoin and Cardano wallet with Charms integration",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <NetworkProvider>
            <WasmProvider>
              <UTXOProvider>
                <CharmsProvider>
                  <MainLayout>
                    {children}
                  </MainLayout>
                </CharmsProvider>
              </UTXOProvider>
            </WasmProvider>
          </NetworkProvider>
        </WalletProvider>
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
