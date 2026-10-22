"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DiscountQuoteState } from "@/app/_lib/use-discount-quote";
import { usePromotions } from "./promotion-provider";
import { cartPromotionAdvice, promotionHeadline, promotionTerms } from "@/app/_lib/storefront-promotions";
import { formatPrice } from "@/app/_lib/format";

export function CouponEntry({ state, disabled = false }: { state: DiscountQuoteState; disabled?: boolean }) {
  const [draft, setDraft] = useState("");
  const offers = usePromotions();
  const quote = state.quote;
  const { suggestion, remaining, automaticSaving, paymentNotice } = cartPromotionAdvice(offers, quote?.lines ?? [], quote?.subtotal ?? 0, quote?.discount ?? null, state.code, state.paymentMethod);
  return <div className="my-4 min-w-0 space-y-2 break-words border-t pt-4">
    <Label htmlFor="checkout-coupon">Coupon code</Label>
    <div className="flex gap-2"><Input id="checkout-coupon" autoComplete="off" maxLength={40} value={draft} placeholder={state.code || "Enter coupon code"} disabled={disabled || state.loading} onChange={e => setDraft(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (draft.trim()) { state.setCode(draft); setDraft(""); } } }} /><Button type="button" variant="outline" disabled={disabled || state.loading || !draft.trim()} onClick={() => { state.setCode(draft); setDraft(""); }}>Apply</Button></div>
    {state.code && <div className="flex items-center justify-between gap-2 text-sm"><span className="break-all font-mono">{state.code}</span><Button type="button" size="sm" variant="ghost" disabled={disabled || state.loading} onClick={() => { state.setCode(""); setDraft(""); }}>Remove</Button></div>}
    <div aria-live="polite" className="text-xs">
      {state.loading && <p className="text-muted-foreground">Checking prices and offers…</p>}
      {state.error && <p role="alert" className="text-destructive">{state.error} <button type="button" className="underline" disabled={disabled} onClick={state.refresh}>Retry</button></p>}
      {state.quote?.discount && <p className="text-brand">{state.quote.discount.name} {state.quote.discount.code ? "applied" : "applied automatically"}.</p>}
      {quote && (quote.notice || paymentNotice) && <p role="status" className="text-muted-foreground">{quote.notice || paymentNotice}</p>}
      {quote && !quote.discount && !state.code && !paymentNotice && !quote.notice && <p className="text-muted-foreground">No automatic discount applies to these items.</p>}
      {state.code && automaticSaving > (quote?.discount?.amount ?? 0) && <p className="mt-1 text-muted-foreground">Remove this code to use an automatic saving of {formatPrice(automaticSaving / 100)}.</p>}
    </div>
    {suggestion && !state.loading && <div className="rounded-md bg-muted/50 p-3 text-xs leading-relaxed">
      <p className="font-medium">{promotionHeadline(suggestion)}</p>
      {remaining > 0 && <p className="mt-1">Add {formatPrice(remaining / 100)} more to reach the minimum order. Sale items do not receive this discount.</p>}
      <p className="mt-1 text-muted-foreground">{promotionTerms(suggestion)}</p>
      {suggestion.code && <Button type="button" variant="outline" size="sm" className="mt-2" disabled={disabled || state.loading} onClick={() => { state.setCode(suggestion.code!); setDraft(""); }}>Use {suggestion.code}</Button>}
    </div>}
    <p className="text-xs text-muted-foreground">One offer per order. A coupon replaces automatic discounts. Sale items are excluded.</p>
  </div>;
}
