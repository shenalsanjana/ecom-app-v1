export type OrderItemSummaryInput = { name: string; color?: string | null; quantity: number };

/** Admin views always show the color slot (unlike customer copy, which omits missing
 *  attributes); a missing/blank color renders as an em dash. */
export function formatOrderItemLine(item: OrderItemSummaryInput): string {
  const color = item.color?.trim();
  return `${item.name} - ${color && color.length > 0 ? color : "—"} x${item.quantity}`;
}

export function omittedItemCount(totalCount: number, shownCount: number): number {
  return Math.max(0, totalCount - shownCount);
}
