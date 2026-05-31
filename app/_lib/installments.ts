// Koko and Mintpay both split an order into equal, interest-free instalments
// ("pay in 3"). This is display-only — the gateways compute their own schedules.
export const INSTALMENT_COUNT = 3;

/** Per-instalment amount for a "pay in 3" plan, rounded to 2 decimals. */
export function installmentAmount(total: number, count: number = INSTALMENT_COUNT): number {
  if (!Number.isFinite(total) || total <= 0 || count <= 0) return 0;
  return Math.round((total / count) * 100) / 100;
}
