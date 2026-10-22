"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCouponCode, setCouponCode } from "./coupon-store";
import { getDiscountQuote } from "@/app/checkout/discount-actions";
import type { CartItem } from "./cart-context";
import type { DiscountQuote } from "./discount-service";
import type { PaymentMethod } from "./payments/types";

export function useDiscountQuote(items: CartItem[], updatePrices: (prices: { variantId: string; price: number }[]) => void, enabled = true, paymentMethod?: PaymentMethod) {
  const code = useCouponCode();
  const [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<{ key: string; quote?: DiscountQuote; error?: string } | null>(null);
  const itemKey = JSON.stringify(items.map(i => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity, price: i.price })));
  const key = `${itemKey}|${code}|${paymentMethod ?? ""}|${revision}`;
  const setCode = useCallback((value: string) => setCouponCode(value), []);
  const refresh = useCallback(() => setRevision(v => v + 1), []);
  useEffect(() => {
    if (itemKey === "[]" || !enabled) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await getDiscountQuote(JSON.parse(itemKey), code, paymentMethod);
        if (cancelled) return;
        if (result.success) {
          setResponse({ key, quote: result.quote });
          const current = JSON.parse(itemKey) as CartItem[];
          if (result.quote.prices.some(p => current.some(i => i.variantId === p.variantId && i.price !== p.price))) updatePrices(result.quote.prices);
        } else setResponse({ key, error: result.error });
      } catch { if (!cancelled) setResponse({ key, error: "Unable to check offers. Please try again." }); }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [itemKey, key, code, paymentMethod, updatePrices, enabled]);
  // Recheck expiry and availability when shoppers return to a checkout tab.
  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => refresh();
    const timer = setInterval(() => { if (document.visibilityState !== "hidden") refresh(); }, 30_000);
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [refresh, enabled]);
  return useMemo(() => ({
    code, setCode, refresh, paymentMethod,
    quote: response?.key === key ? response.quote ?? null : null,
    error: response?.key === key ? response.error ?? null : null,
    loading: items.length > 0 && response?.key !== key,
    ready: response?.key === key && !!response.quote,
  }), [code, setCode, refresh, paymentMethod, response, key, items.length]);
}
export type DiscountQuoteState = ReturnType<typeof useDiscountQuote>;
