// Asia/Colombo day-boundary helper. SL is UTC+5:30 with no DST,
// so a fixed offset + Date.UTC arithmetic is safe across year/month/leap boundaries.

const SL_OFFSET_MINUTES = 5 * 60 + 30;

export function startOfTodaySLT(now: Date = new Date()): Date {
  const slMillis = now.getTime() + SL_OFFSET_MINUTES * 60_000;
  const sl = new Date(slMillis);
  const startSltUtcMillis = Date.UTC(
    sl.getUTCFullYear(),
    sl.getUTCMonth(),
    sl.getUTCDate(),
  );
  return new Date(startSltUtcMillis - SL_OFFSET_MINUTES * 60_000);
}
