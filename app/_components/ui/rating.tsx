import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type RatingProps = {
  rating: number;
  reviewCount: number;
  className?: string;
};

export function Rating({ rating, reviewCount, className }: RatingProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground",
        className
      )}
    >
      <Star className="h-3.5 w-3.5 fill-amber-400 stroke-amber-400" aria-hidden />
      <span className="font-medium text-foreground">{rating.toFixed(1)}</span>
      <span>({reviewCount.toLocaleString()})</span>
    </span>
  );
}
