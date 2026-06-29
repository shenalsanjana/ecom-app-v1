// app/_components/ui/text-link.tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

type TextLinkProps = React.ComponentProps<typeof Link>;

export function TextLink({ className, children, ...props }: TextLinkProps) {
  return (
    <Link
      className={cn(
        "group/textlink relative inline-flex items-center rounded-sm text-sm font-medium text-foreground outline-none transition-colors",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
      {...props}
    >
      <span className="relative">
        {children}
        <span
          aria-hidden
          className="absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-current transition-transform duration-(--duration-base) ease-(--ease-out) motion-safe:group-hover/textlink:scale-x-100"
        />
      </span>
    </Link>
  );
}
