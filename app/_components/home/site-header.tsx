// app/_components/home/site-header.tsx
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { auth } from "@/app/_lib/auth";
import { getWishlistCount } from "@/app/_lib/wishlist";
import { WishlistIcon } from "@/app/_components/header/wishlist-icon";
import { ProfileMenu } from "@/app/_components/header/profile-menu";
import { CartIconWrapper } from "@/app/_components/header/cart-icon-wrapper";

const NAV_LINKS = [
  { href: "#", label: "Shop" },
  { href: "#", label: "Categories" },
  { href: "#", label: "Deals" },
  { href: "/contact", label: "Contact Us" },
];

export async function SiteHeader() {
  const session = await auth();
  const loggedIn = !!session?.user;
  const wishlistCount = session?.user?.id ? await getWishlistCount(session.user.id) : 0;
  const userForMenu = session?.user
    ? { name: session.user.name ?? "", email: session.user.email ?? "" }
    : null;

  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-lg font-semibold tracking-tight">Dressing Bear</Link>
        <nav className="hidden items-center gap-5 text-sm md:flex">
          {NAV_LINKS.map((l) => (
            <Link key={l.label} href={l.href} className="text-muted-foreground hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="relative ml-auto hidden flex-1 max-w-sm md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" placeholder="Search products" className="pl-9" />
        </div>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <WishlistIcon loggedIn={loggedIn} count={wishlistCount} />
          <CartIconWrapper />
          <ProfileMenu user={userForMenu} />
        </div>
      </div>
    </header>
  );
}
