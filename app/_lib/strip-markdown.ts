// Strips common markdown syntax for use in plain-text contexts (meta description).
// Not bulletproof — fine for our seeded content.
export function stripMarkdown(md: string, maxLen = 160): string {
  const text = md
    .replace(/```[\s\S]*?```/g, " ")           // fenced code blocks
    .replace(/`([^`]+)`/g, "$1")                // inline code
    .replace(/^#+\s+/gm, "")                    // headings
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1") // bold/italic
    .replace(/^\s*[-*+]\s+/gm, "")              // bullet list markers
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")   // images → alt text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")    // links → text
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).trimEnd() + "…";
}
