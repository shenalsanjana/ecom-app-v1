// SKU metadata never owns a quantity; allocation still uses frozen pool IDs.
export function saleSkuForSize(
  cells: { size: string; sku?: string | null }[],
  size: string | null | undefined,
  legacySku?: string | null,
): string | null {
  return cells.find(cell => cell.size === size)?.sku ?? legacySku ?? null;
}
