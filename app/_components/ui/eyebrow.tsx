// app/_components/ui/eyebrow.tsx
import { cn } from "@/lib/utils";

type EyebrowProps = React.ComponentProps<"p"> & {
  tone?: "brand" | "inverse";
};

export function Eyebrow({ className, tone = "brand", ...props }: EyebrowProps) {
  return (
    <p
      className={cn(
        "text-[0.6875rem] font-semibold uppercase tracking-[0.16em]",
        tone === "brand" ? "text-brand" : "text-white/80",
        className
      )}
      {...props}
    />
  );
}
