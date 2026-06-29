"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

// Copies a category's absolute ad URL to the clipboard for pasting into Meta Ads
// Manager. Best-effort: a clipboard failure simply shows no "Copied" state and
// never throws to the user.
export function CopyAdLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context / denied) — no-op.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={url}
      aria-label={copied ? "Ad link copied" : "Copy ad link"}
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary/60"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy ad link"}
    </button>
  );
}
