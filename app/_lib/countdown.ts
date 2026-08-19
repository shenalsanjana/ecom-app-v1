// app/_lib/countdown.ts
// Pure clock math for the "Deals of the day" countdown. Kept out of the client
// island so it can be unit-tested without fake timers or a DOM.

/** Milliseconds from `now` to 23:59:59.999 of the same local day. */
export function msUntilEndOfDay(now: Date): number {
  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );
  return Math.max(0, end.getTime() - now.getTime());
}

/** `HH:MM:SS`, truncating sub-second remainders and clamping negatives to zero. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
