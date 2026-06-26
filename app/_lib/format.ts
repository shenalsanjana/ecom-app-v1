// app/_lib/format.ts
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function initials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Small fixed palette; each entry is a Tailwind background + readable foreground.
// Class strings are full literals so the JIT compiler emits them.
const AVATAR_COLORS = [
  "bg-rose-500 text-white",
  "bg-orange-500 text-white",
  "bg-amber-500 text-black",
  "bg-emerald-500 text-white",
  "bg-teal-500 text-white",
  "bg-sky-500 text-white",
  "bg-indigo-500 text-white",
  "bg-violet-500 text-white",
] as const;

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const priceFormatter = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatPrice(value: number): string {
  return priceFormatter.format(value);
}
