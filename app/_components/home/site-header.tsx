import Link from "next/link";
import { Search, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const NAV_LINKS = [
  { href: "#", label: "Shop" },
  { href: "#", label: "Categories" },
  { href: "#", label: "Deals" },
  { href: "#", label: "About" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Shoply
        </Link>
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
        <Button variant="ghost" size="icon" className="relative ml-auto md:ml-0" aria-label="Cart">
          <ShoppingCart className="h-5 w-5" />
          <Badge className="absolute -right-1 -top-1 h-5 min-w-[1.25rem] rounded-full px-1 text-[10px]">
            3
          </Badge>
        </Button>
      </div>
    </header>
  );
}
