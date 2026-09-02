// app/_components/ui/slide-clock.tsx
"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { SLIDE_INTERVAL_MS } from "@/app/_lib/slide-rotation";

const TickContext = createContext(0);

/** Every tile reads this, so they all cross-fade together off one interval.
 *  One timer, not one per tile: N intervals drift visibly apart. */
export function useSlideTick(): number {
  return useContext(TickContext);
}

export function SlideClock({ children }: { children: React.ReactNode }) {
  // Starts at 0 and only advances after mount, so the server's HTML and the
  // first client paint agree -- the hydration rule DealsCountdown follows.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // A CSS `motion-safe:` class cannot gate a setInterval, so the query is
    // read here instead. Under reduced motion the timer never starts; the
    // dots stay clickable, so the slides remain reachable.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTick((t) => t + 1), SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return <TickContext.Provider value={tick}>{children}</TickContext.Provider>;
}
