import Link from "next/link";
import { Separator } from "@/components/ui/separator";

type LinkItem = { label: string; href: string };

const COLUMNS: { heading: string; links: LinkItem[] }[] = [
  {
    heading: "Shop",
    links: [
      { label: "All Products", href: "/categories" },
      { label: "New Arrivals", href: "/categories?sort=newest" },
      { label: "Best Sellers", href: "/categories?sort=rating" },
      { label: "Deals", href: "/deals" },
    ],
  },
  {
    heading: "Categories",
    links: [
      { label: "Oversize T-Shirts", href: "/categories/oversize-tshirts" },
      { label: "Graphic Tees", href: "/categories/graphic-tees" },
      { label: "Solid Basics", href: "/categories/solid-basics" },
    ],
  },
  {
    heading: "Help",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact Us", href: "/contact" },
      { label: "Returns", href: "/refund-policy" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Refund Policy", href: "/refund-policy" },
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms & Conditions", href: "/terms-and-conditions" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h3 className="text-sm font-semibold tracking-wide uppercase">{col.heading}</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="hover:text-foreground">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Separator className="my-8" />
        <div className="flex flex-col items-start justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Dressing Bear. All rights reserved.</p>
          <p>Built with Next.js. Prices and stock for demonstration only.</p>
        </div>
      </div>
    </footer>
  );
}
