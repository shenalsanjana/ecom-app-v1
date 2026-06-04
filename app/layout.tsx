import type { Metadata } from "next";
import { Geist_Mono, Poppins } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { CartProvider } from "@/app/_lib/cart-context";
import { WishlistProvider } from "@/app/_lib/wishlist-context";
import { WhatsAppFloatButton } from "@/app/_components/whatsapp-float-button";
import { AnnouncementBar } from "@/app/_components/shared/announcement-bar";
import { DeliveryConfigProvider } from "@/app/_components/delivery/delivery-config-provider";
import { getDeliveryConfig } from "@/app/_lib/store-settings";
import "./globals.css";

// Poppins is the single brand typeface: Regular (body), Medium (buttons),
// SemiBold/Bold (headings & banners). Poppins isn't a variable font on Google
// Fonts, so the weights we use must be declared explicitly.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Dressing Bear — Oversize T-Shirts",
    template: "%s | Dressing Bear",
  },
  description:
    "Shop premium oversize t-shirts with size variants. Cash on Delivery available.",
  openGraph: {
    type: "website",
    siteName: "Dressing Bear",
    locale: "en_LK",
    url: APP_URL,
    title: "Dressing Bear — Oversize T-Shirts",
    description:
      "Shop premium oversize t-shirts with size variants. Cash on Delivery available.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dressing Bear — Oversize T-Shirts",
    description: "Shop premium oversize t-shirts with size variants.",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const deliveryConfig = await getDeliveryConfig();

  return (
    <html
      lang="en"
      className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AnnouncementBar freeThreshold={deliveryConfig.freeThreshold} />
        <DeliveryConfigProvider value={deliveryConfig}>
          <SessionProvider>
            <WishlistProvider>
              <CartProvider>{children}</CartProvider>
            </WishlistProvider>
          </SessionProvider>
        </DeliveryConfigProvider>
        <WhatsAppFloatButton />
      </body>
    </html>
  );
}
