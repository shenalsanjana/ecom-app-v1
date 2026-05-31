import type { Metadata } from "next";
import { Geist_Mono, Inter, Fraunces } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { CartProvider } from "@/app/_lib/cart-context";
import { WishlistProvider } from "@/app/_lib/wishlist-context";
import { WhatsAppFloatButton } from "@/app/_components/whatsapp-float-button";
import { AnnouncementBar } from "@/app/_components/shared/announcement-bar";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AnnouncementBar />
        <SessionProvider>
          <WishlistProvider>
            <CartProvider>{children}</CartProvider>
          </WishlistProvider>
        </SessionProvider>
        <WhatsAppFloatButton />
      </body>
    </html>
  );
}
