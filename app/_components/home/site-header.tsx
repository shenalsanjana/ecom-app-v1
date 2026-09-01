// app/_components/home/site-header.tsx
import Link from "next/link";
import { Home, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { WishlistIcon } from "@/app/_components/header/wishlist-icon";
import { ProfileMenu } from "@/app/_components/header/profile-menu";
import { CartIconWrapper } from "@/app/_components/header/cart-icon-wrapper";
import { MobileNav } from "@/app/_components/header/mobile-nav";
import { BrandMark } from "@/app/_components/shared/brand-mark";
import { getDepartments } from "@/app/_lib/taxonomy";
import { navColumns } from "@/app/_lib/taxonomy-nav";
import { MegaMenu } from "@/app/_components/header/mega-menu";

const NAV_LINKS = [
  { href: "/deals", label: "Deals" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export async function SiteHeader() {
  // One cached read (same key the footer already uses on every page), turned
  // into plain columns here so the client leaves never import Prisma.
  const columns = navColumns(await getDepartments());

  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6 lg:px-8">
        <MobileNav columns={columns} />
        <BrandMark />
        <Link
          href="/"
          aria-label="Home"
          className="hidden items-center text-muted-foreground transition-colors duration-(--duration-fast) hover:text-brand md:inline-flex"
        >
          <Home className="h-5 w-5" />
        </Link>
        <nav className="hidden items-center gap-5 text-sm md:flex">
          <MegaMenu columns={columns} />
          {NAV_LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="text-xs uppercase tracking-[0.12em] text-muted-foreground transition-colors duration-(--duration-fast) hover:text-brand"
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
