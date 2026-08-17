// app/_lib/meta-pixel.ts
// Client-only wrapper around the Meta Pixel global (window.fbq). The single
// source of truth for whether tracking is active. Every call is a no-op unless
// the base script has loaded window.fbq — which only happens when
// NEXT_PUBLIC_META_PIXEL_ID is set (see MetaPixelScript). No component reads the
// env var or touches window.fbq directly.

export type MetaEvent =
  | "PageView"
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "Purchase";

const CURRENCY = "LKR" as const;

type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window {
    fbq?: Fbq;
  }
}

export function pixelId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  return id && id.length > 0 ? id : undefined;
}

export function isPixelConfigured(): boolean {
  return Boolean(pixelId());
}

function fbq(): Fbq | undefined {
  if (typeof window === "undefined") return undefined;
  return typeof window.fbq === "function" ? window.fbq : undefined;
}

export function track(
  event: MetaEvent,
  payload?: Record<string, unknown>,
  options?: { eventID?: string },
): void {
  const f = fbq();
  if (!f) return;
  try {
    if (options) f("track", event, payload ?? {}, options);
    else f("track", event, payload ?? {});
  } catch {
    // Pixel must never break the page.
  }
}

function trackCustom(name: string, payload?: Record<string, unknown>): void {
  const f = fbq();
  if (!f) return;
  try {
    f("trackCustom", name, payload ?? {});
  } catch {
    // Pixel must never break the page.
  }
}

export function trackViewCategory(categoryName: string): void {
  // Custom event (not ViewContent) so the product-level conversion signal stays
  // clean. Carries the category NAME, not the slug, so audiences survive slug
  // renames (the app rewrites slugs via getCategorySlugRedirect).
  trackCustom("ViewCategory", {
    content_category: categoryName,
    content_name: categoryName,
  });
}

function content(productIds: string[], value: number, extra?: Record<string, unknown>) {
  return {
    content_ids: productIds,
    content_type: "product",
    value,
    currency: CURRENCY,
    ...extra,
  };
}

export function trackViewContent(productId: string, value: number): void {
  track("ViewContent", content([productId], value));
}

export function trackAddToCart(productId: string, value: number, quantity: number): void {
  track("AddToCart", content([productId], value, { num_items: quantity }));
}

export function trackInitiateCheckout(
  contentIds: string[],
  value: number,
  numItems: number,
): void {
  track("InitiateCheckout", content(contentIds, value, { num_items: numItems }));
}

export async function trackPurchaseOnce(
  orderId: string,
  value: number,
  contentIds: string[],
): Promise<void> {
  const f = fbq();
  // TEMP DEBUG (remove after diagnosing the live-tracking-dead issue): makes
  // the fbq-presence check readable straight from Console instead of having
  // to infer it from the Network tab, which can't distinguish "blocked" from
  // "loaded but neutered by an extension."
  console.log("[pixel-debug] trackPurchaseOnce: window.fbq is", typeof f === "function" ? "a function (ok)" : f);
  if (!f || typeof window === "undefined") return;

  // Dedupe: browser Pixel does not auto-dedupe repeated browser fires, and the
  // success page is revisitable (refresh / back-nav / a different browser
  // context entirely). The claim is atomic and server-side (Order.purchaseTrackedAt)
  // rather than localStorage, which isn't durable across browser contexts and
  // was allowing the same order to fire repeatedly.
  let claimed: boolean;
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/claim-purchase-tracking`, {
      method: "POST",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { claimed?: boolean };
    claimed = data.claimed === true;
  } catch {
    // Can't confirm we won the claim — skip rather than risk a duplicate fire.
    return;
  }
  if (!claimed) return;

  track("Purchase", content(contentIds, value), { eventID: orderId });
}
