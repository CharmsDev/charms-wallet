import "./globals.css";
import MainLayout from "@/components/layout/MainLayout";
import { WalletProvider } from "@/stores/walletStore";
import { BlockchainProvider } from "@/stores/blockchainStore";
import { AddressesProvider } from "@/stores/addressesStore";
import { UTXOProvider } from "@/stores/utxoStore";
import { CharmsProvider } from "@/stores/charmsStore";

export const metadata = {
  title: "Multi-Chain Wallet with Charms",
  description: "A secure and user-friendly Bitcoin and Cardano wallet with Charms integration",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <BlockchainProvider>
            <AddressesProvider>
              <UTXOProvider>
                <CharmsProvider>
                  <MainLayout>
                    {children}
                  </MainLayout>
                </CharmsProvider>
              </UTXOProvider>
            </AddressesProvider>
          </BlockchainProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
