import { stockStatus } from "@/app/_lib/stock-indicator";

export function StockIndicator({ stock }: { stock: number }) {
  const { tone, label } = stockStatus(stock);
  const textClass = tone === "out" ? "text-destructive" : "text-brand";
  const dotClass = tone === "out" ? "bg-destructive" : "bg-brand";
  return (
    <span className={"inline-flex items-center gap-2 text-sm " + textClass}>
      <span className={"h-1.5 w-1.5 rounded-full " + dotClass} aria-hidden />
      {label}
    </span>
  );
}
