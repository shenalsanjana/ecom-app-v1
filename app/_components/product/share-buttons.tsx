"use client";

import { useState } from "react";
// NOTE: lucide-react v1 removed the `Facebook` brand glyph, so we inline a tiny
// Facebook SVG below. WhatsApp uses MessageCircle (lucide has no brand glyph).
// No sonner toast here: the storefront root layout has no <Toaster /> and adding
// one would double up with the admin layout's Toaster. The inline "Copied" button
// state is the feedback (and what the e2e asserts).
import { Share2, MessageCircle, Link2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/app/_lib/format";

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.9h-2.34V22c4.78-.79 8.43-4.94 8.43-9.94Z" />
    </svg>
  );
}

// Product share row: native Web Share sheet (mobile — exposes Instagram,
// Messenger, etc.) plus explicit Facebook / WhatsApp / Copy-link buttons that
// work on every device. Instagram has no web share-link URL, so it is reachable
// only through the native sheet — there is intentionally no IG button.
//
// `url` is the canonical absolute product URL, computed SERVER-SIDE and passed
// in. It must not be built here from absoluteUrl(): APP_URL is not a
// NEXT_PUBLIC_ var, so in the client bundle it inlines to undefined and every
// share would point at http://localhost:3000.
export function ShareButtons({
  url,
  name,
  price,
}: {
  url: string;
  name: string;
  price: number;
}) {
  const shareTitle = `${name} — ${formatPrice(price)}`;
  const [copied, setCopied] = useState(false);

  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function nativeShare() {
    try {
      await navigator.share({ title: shareTitle, text: shareTitle, url });
    } catch {
      // User dismissed the sheet — no-op.
    }
  }

  function openPopup(href: string) {
    window.open(href, "_blank", "noopener,noreferrer,width=600,height=600");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context / denied) — silently no-op.
    }
  }

  const fbHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(`${shareTitle} ${url}`)}`;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Share this product">
      {canNativeShare && (
        <Button type="button" variant="outline" size="sm" className="h-10 gap-2" onClick={nativeShare}>
          <Share2 className="h-4 w-4" aria-hidden /> Share
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 gap-2"
        aria-label="Share on Facebook"
        onClick={() => openPopup(fbHref)}
      >
        <FacebookIcon className="h-4 w-4" /> Facebook
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 gap-2"
        aria-label="Share on WhatsApp"
        onClick={() => openPopup(waHref)}
      >
        <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 gap-2"
        aria-label="Copy product link"
        data-testid="copy-link"
        onClick={copyLink}
      >
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
