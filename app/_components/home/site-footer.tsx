import Link from "next/link";
import { Separator } from "@/components/ui/separator";

const COLUMNS = [
  {
    heading: "Shop",
    links: ["New arrivals", "Best sellers", "Sale", "Gift cards"],
  },
  {
    heading: "Help",
    links: ["Contact us", "Shipping", "Returns", "FAQ"],
  },
  {
    heading: "Company",
    links: ["About", "Careers", "Press", "Sustainability"],
  },
  {
    heading: "Social",
    links: ["Instagram", "TikTok", "YouTube", "Newsletter"],
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
                {col.links.map((label) => (
                  <li key={label}>
                    <Link href="#" className="hover:text-foreground">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Separator className="my-8" />
        <div className="flex flex-col items-start justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Shoply. All rights reserved.</p>
          <p>Built with Next.js. Prices and stock for demonstration only.</p>
        </div>
      </div>
    </footer>
  );
}
