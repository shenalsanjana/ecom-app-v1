// app/_components/home/site-header.tsx
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { WishlistIcon } from "@/app/_components/header/wishlist-icon";
import { ProfileMenu } from "@/app/_components/header/profile-menu";
import { CartIconWrapper } from "@/app/_components/header/cart-icon-wrapper";

const NAV_LINKS = [
  { href: "/categories", label: "Shop" },
  { href: "/deals", label: "Deals" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-lg font-semibold tracking-tight">Dressing Bear</Link>
        <nav className="hidden items-center gap-5 text-sm md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="text-muted-foreground transition-colors duration-(--duration-fast) hover:text-brand"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <form action="/search" className="relative ml-auto hidden flex-1 max-w-sm md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" name="q" placeholder="Search products..." className="pl-9" defaultValue="" />
        </form>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <WishlistIcon />
          <CartIconWrapper />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
