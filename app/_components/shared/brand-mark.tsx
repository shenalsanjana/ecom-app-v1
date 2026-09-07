// app/_components/shared/brand-mark.tsx
import Link from "next/link";
import Image from "next/image";

// Single source of truth for the logo + wordmark. Used by the storefront header
// and the checkout header so the brand mark never downgrades to bare text at the
// most trust-sensitive step (payment).
//
// It is also the way back to "/". Since the nav row dropped its "Home" entry —
// the catalogue is the home page, and two links named one destination twice —
// this is the only home affordance in the bar, so it carries a nav item's
// behaviour as well as its href: the wordmark takes the brand colour on hover
// (the same `hover:text-brand` every other link in the header uses) and the
// whole mark shows a focus ring when tabbed to, rather than sitting there
// looking like inert text.
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={
        "flex shrink-0 items-center gap-2.5 rounded-lg text-foreground " +
        "transition-colors duration-(--duration-fast) hover:text-brand " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
        "focus-visible:ring-offset-2 motion-reduce:transition-none " +
        className
      }
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
      {/* No colour of its own: it inherits the link's, so the hover state above
          reaches the word people actually click. */}
      <span className="font-heading text-xl font-semibold tracking-tight">
        Dressing Bear
      </span>
    </Link>
  );
}
