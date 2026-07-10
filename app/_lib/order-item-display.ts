export type OrderItemSummaryInput = {
  name: string;
  color?: string | null;
  size?: string | null;
  quantity: number;
};

/** Admin views always show the color and size slots (unlike customer copy, which omits
 *  missing attributes); a missing/blank value renders as an em dash. */
export function formatOrderItemLine(item: OrderItemSummaryInput): string {
  const color = item.color?.trim();
  const size = item.size?.trim();
  return `${item.name} - ${color && color.length > 0 ? color : "—"} - ${size && size.length > 0 ? size : "—"} x${item.quantity}`;
}

export function omittedItemCount(totalCount: number, shownCount: number): number {
  return Math.max(0, totalCount - shownCount);
}
