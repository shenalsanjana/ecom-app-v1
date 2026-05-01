// app/_lib/format.ts
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
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
