import type { SVGProps } from "react";
import Image from "next/image";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { getDesigns } from "@/app/_lib/products";

function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z" />
    </svg>
  );
}

const SOCIAL_LINKS = [
  { label: "Instagram", href: "https://www.instagram.com/dressingbear/", icon: InstagramIcon },
  { label: "Facebook", href: "https://web.facebook.com/DressingBear/", icon: FacebookIcon },
];

type LinkItem = { label: string; href: string };

const STATIC_COLUMNS: { heading: string; links: LinkItem[] }[] = [
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

export async function SiteFooter() {
  const categories = await getDesigns();
  const categoryLinks: LinkItem[] = categories
    .slice(0, 6)
    .map((c) => ({ label: c.name, href: `/categories/${c.slug}` }));

  // Insert the dynamic Categories column second (between Shop and Help) so the
  // visual order matches the previous static layout.
  const columns: { heading: string; links: LinkItem[] }[] = [
    STATIC_COLUMNS[0],
    { heading: "Categories", links: categoryLinks },
    STATIC_COLUMNS[1],
    STATIC_COLUMNS[2],
  ];

  return (
    <footer className="border-t bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {columns.map((col) => (
            <div key={col.heading}>
              <h3 className="font-heading text-sm font-semibold tracking-wide uppercase">{col.heading}</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {col.links.map((link) => (
                  <li key={link.label + link.href}>
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
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-3">
            {SOCIAL_LINKS.map(({ label, href, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <Icon className="size-5" aria-hidden />
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt=""
              width={64}
              height={64}
              className="h-7 w-7 object-contain"
            />
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} Dressing Bear. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
