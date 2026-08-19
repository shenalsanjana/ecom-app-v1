// app/_components/home/deals-countdown.tsx
"use client";
import { useEffect, useState } from "react";
import { msUntilEndOfDay, formatCountdown } from "@/app/_lib/countdown";

// The only client state on the home page. Renders a fixed placeholder on the
// server and for the first client paint — computing the clock during render
// would make server and client HTML disagree and trip a hydration mismatch.
export function DealsCountdown() {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(msUntilEndOfDay(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm">
      <span
        className="h-2 w-2 shrink-0 rounded-full motion-safe:animate-pulse"
        style={{
          backgroundColor: "var(--brand)",
          boxShadow: "0 0 0 4px color-mix(in oklab, var(--brand) 30%, transparent)",
        }}
        aria-hidden
      />
      Ends in{" "}
      <span
        className="font-mono tabular-nums"
        style={{ color: "color-mix(in oklab, var(--brand) 65%, white)" }}
      >
        {remaining === null ? "--:--:--" : formatCountdown(remaining)}
      </span>
    </span>
  );
}
