export type StockTone = "out" | "low" | "in";
export type StockStatus = { tone: StockTone; label: string };

export function stockStatus(stock: number, lowThreshold = 5): StockStatus {
  if (stock <= 0) return { tone: "out", label: "Out of stock" };
  if (stock <= lowThreshold) return { tone: "low", label: `Only ${stock} left` };
  return { tone: "in", label: "In stock" };
}
