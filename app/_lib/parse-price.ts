/** A price filter only counts once it parses to a real, non-negative number.
 *  `Number.parseFloat("abc")` is NaN, and NaN reaching a Prisma `gte`/`lte`
 *  silently matches nothing — an empty results page with no explanation. */
export function parsePrice(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
