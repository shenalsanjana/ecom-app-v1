export type StockMode = "PRINTED_TO_ORDER" | "PLAIN";

// Omitted mode retains the existing printed-product contract for legacy callers.
export function requiresPrint(mode?: StockMode): boolean {
  return mode !== "PLAIN";
}

export function effectivePrintId(product: { stockMode?: StockMode; dtfDesignId: string | null }): string | null {
  return requiresPrint(product.stockMode) ? product.dtfDesignId : null;
}
