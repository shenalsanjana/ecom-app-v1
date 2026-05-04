import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CartProvider } from "@/app/_lib/cart-context";
import { WhatsAppFloatButton } from "@/app/_components/whatsapp-float-button";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <CartProvider>{children}</CartProvider>
        <WhatsAppFloatButton />
      </body>
    </html>
  );
}
