import { startOfTodaySLT } from "../time";
export const DAY = 86_400_000;
export type SalesQuery = { period?: string; start?: string; end?: string; channel?: string };
export type SalesRange = { start: string; end: string; from: Date; to: Date; channel: "ALL" | "POS" | "ONLINE"; period: string };
export function sltDay(date: Date) { return new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 10); }
function day(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose valid start and end dates.");
  const stamp = Date.parse(value + "T00:00:00+05:30");
  if (!Number.isFinite(stamp) || sltDay(new Date(stamp)) !== value) throw new Error("Choose valid start and end dates.");
  return new Date(stamp);
}
export function salesRange(query: SalesQuery, now = new Date()): SalesRange {
  const period = query.period ?? "today", channel = query.channel ?? "ALL";
  if (!["ALL", "POS", "ONLINE"].includes(channel)) throw new Error("Choose a valid sales channel.");
  const today = startOfTodaySLT(now);
  let from = today, through = today;
  if (period === "week") {
    const weekday = new Date(today.getTime() + 330 * 60_000).getUTCDay();
    from = new Date(today.getTime() - ((weekday + 6) % 7) * DAY);
  } else if (period === "month") {
    from = day(sltDay(today).slice(0, 8) + "01");
  } else if (period === "custom") { from = day(query.start ?? ""); through = day(query.end ?? ""); }
  else if (period !== "today") throw new Error("Choose today, week, month or custom dates.");
  const days = (through.getTime() - from.getTime()) / DAY + 1;
  if (days < 1 || days > 366) throw new Error("Choose a date range of 1–366 days.");
  return { start: sltDay(from), end: sltDay(through), from, to: new Date(through.getTime() + DAY), channel: channel as SalesRange["channel"], period };
}
