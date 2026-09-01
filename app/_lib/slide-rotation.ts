// app/_lib/slide-rotation.ts
// Pure rotation arithmetic for the taxonomy tiles' slide shows. Kept out of the
// client island so it can be unit-tested -- the Vitest run is node-only with no
// DOM, so a hooks-based component cannot be rendered at all.

/** The prototype advances every tile off one clock at this interval. */
export const SLIDE_INTERVAL_MS = 3800;

/** A tile only rotates, and only subscribes to the clock, with something to rotate. */
export function rotates(count: number): boolean {
  return count > 1;
}

/**
 * Which slide is showing. A pin wins over the tick: once a visitor picks a
 * slide, advancing past it takes the page back off them. A stale pin that no
 * longer exists is ignored and we show the slide indicated by the tick instead.
 */
export function slideIndex(tick: number, count: number, pinned: number | null): number {
  if (count <= 0) return 0;
  if (pinned !== null && pinned >= 0 && pinned < count) return pinned;
  return ((tick % count) + count) % count;
}

/** Accessible name for a dot. Design-tile slides are photos with no caption. */
export function dotLabel(
  subject: string,
  slideLabel: string | undefined,
  index: number,
  total: number,
): string {
  return slideLabel ? `Show ${slideLabel}` : `Show ${subject}, image ${index + 1} of ${total}`;
}
