"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { shouldStartProgress } from "@/app/_lib/navigation-progress-util";

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const [width, setWidth] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Start the bar when an internal link is clicked (capture phase so we see it
  // before the router begins its transition).
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!shouldStartProgress(window.location.pathname, href, window.location.search)) {
        return;
      }
      // Drop any timers still pending from a prior click so they can't reset
      // a fresh navigation mid-flight.
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setActive(true);
      setWidth(10);
      // Ease toward 90% while we wait for the new route to commit.
      timers.current.push(setTimeout(() => setWidth(60), 100));
      timers.current.push(setTimeout(() => setWidth(85), 350));
      // Safety net: if the route never settles (canceled/blocked navigation),
      // reset so the bar can't get stuck visible.
      timers.current.push(
        setTimeout(() => {
          setActive(false);
          setWidth(0);
        }, 5000),
      );
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Complete the bar whenever the route (path or query) settles.
  useEffect(() => {
    if (!active) return;
    // Route settled — drop the pending easing/safety timers and finish.
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setWidth(100);
    const done = setTimeout(() => {
      setActive(false);
      setWidth(0);
    }, 250);
    return () => clearTimeout(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // Clear any pending easing timers on unmount.
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (!active && width === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
    >
      <div
        className="h-full bg-brand transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${width}%`, opacity: active ? 1 : 0 }}
      />
    </div>
  );
}
