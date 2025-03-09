import "./globals.css";
import MainLayout from "@/components/layout/MainLayout";
import { WalletProvider } from "@/stores/walletStore";
import { AddressesProvider } from "@/stores/addressesStore";

export const metadata = {
  title: "Bitcoin Wallet with Charms",
  description: "A secure and user-friendly Bitcoin wallet with Charms integration",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <AddressesProvider>
            <MainLayout>
              {children}
            </MainLayout>
          </AddressesProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
