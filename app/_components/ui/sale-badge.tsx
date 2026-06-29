// app/_components/ui/sale-badge.tsx
import { cn } from "@/lib/utils";

type SaleBadgeProps = {
  pct: number;
  className?: string;
};

export function SaleBadge({ pct, className }: SaleBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg border border-brand/25 bg-card/90 px-2 py-0.5 text-xs font-semibold text-brand",
        className
      )}
    >
      −{pct}%
    </span>
  );
}
