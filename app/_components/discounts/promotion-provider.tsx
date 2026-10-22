"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { activePromotions, type PromotionSnapshot, type StorefrontPromotion } from "@/app/_lib/storefront-promotions";

const PromotionContext = createContext<StorefrontPromotion[]>([]);
export function PromotionProvider({ initial, children }: { initial: PromotionSnapshot; children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [now, setNow] = useState(initial.asOf);
  useEffect(() => {
    let cancelled = false;
    let pending = false;
    const controller = new AbortController();
    async function refresh() {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const result = await fetch("/api/promotions", { cache: "no-store", signal: controller.signal });
        if (!result.ok) throw new Error("Unavailable");
        const next: PromotionSnapshot = await result.json();
        if (!cancelled) { setSnapshot(next); setNow(Date.now()); }
      } catch { if (!cancelled) { setSnapshot({ offers: [], asOf: Date.now() }); setNow(Date.now()); } }
      finally { pending = false; }
    }
    void refresh();
    const timer = setInterval(() => { setNow(Date.now()); void refresh(); }, 30_000);
    const focus = () => { setNow(Date.now()); void refresh(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => { cancelled = true; controller.abort(); clearInterval(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, []);
  // Expire/start locally at the real boundary even between availability refreshes.
  useEffect(() => {
    const boundary = snapshot.offers.flatMap(r => [r.startsAt, r.expiresAt]).filter((v): v is string => !!v).map(Date.parse).filter(t => t > now).sort((a, b) => a - b)[0];
    if (!boundary) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(2_147_483_647, Math.max(1, boundary - Date.now())));
    return () => clearTimeout(timer);
  }, [snapshot, now]);
  const offers = useMemo(() => activePromotions(snapshot.offers, now), [snapshot, now]);
  return <PromotionContext.Provider value={offers}>{children}</PromotionContext.Provider>;
}
export function usePromotions() { return useContext(PromotionContext); }
