// Product category is stored as a slug. Render a human label for UI eyebrows.
// Rule: split on hyphens, capitalise each token. Join with a hyphen when the
// first token is a single letter (e.g. "t-shirts" -> "T-Shirts"); otherwise
// join with spaces ("day-dresses" -> "Day Dresses").
export function prettifyCategory(slug: string): string {
  const trimmed = slug.trim();
  if (!trimmed) return "";
  const parts = trimmed.split("-").map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p));
  const joiner = parts[0]?.length === 1 ? "-" : " ";
  return parts.join(joiner);
}
