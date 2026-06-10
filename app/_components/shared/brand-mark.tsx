// app/_components/shared/brand-mark.tsx
import Link from "next/link";
import Image from "next/image";

// Single source of truth for the logo + wordmark. Used by the storefront header
// and the checkout header so the brand mark never downgrades to bare text at the
// most trust-sensitive step (payment).
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={"flex shrink-0 items-center gap-2.5 " + className}
      aria-label="Dressing Bear — home"
    >
      <Image
        src="/logo.png"
        alt=""
        width={80}
        height={80}
        priority
        className="h-9 w-9 object-contain"
      />
      <span className="font-heading text-xl font-semibold tracking-tight text-foreground">
        Dressing Bear
      </span>
    </Link>
  );
}
