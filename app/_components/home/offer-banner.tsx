// app/_components/home/offer-banner.tsx
import Link from "next/link";
import { Banknote, Check, CreditCard, Star } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DealsCountdown } from "@/app/_components/home/deals-countdown";

/** The masthead of the shop-all home page: who this is, why it is safe to buy,
 *  and what is currently reduced — in one band, above the catalogue.
 *
 *  It replaced a 640px photo hero, and it stays short for the same reason the
 *  hero went: on a phone the first thing worth seeing is a product. The offer
 *  is a bounded panel rather than a full-bleed banner so the band can carry a
 *  sale without growing into one.
 *
 *  It carries the page's <h1>, so the catalogue below it must not render one.
 *  The heading is the design name once a filter is on, which is why it arrives
 *  as a prop rather than being fixed here.
 *
 *  The four signals are SocialProof's, absorbed rather than duplicated —
 *  social-proof.tsx is no longer rendered anywhere. Two deliberate omissions:
 *  free shipping (AnnouncementBar carries it on every page) and 7-day returns
 *  (TrustStrip carries it at the foot of this one). Pay in 3 takes the freed
 *  slot because nothing else on the page names it. */

type Signal = { icon: typeof Star; text: React.ReactNode };

const SIGNALS: Signal[] = [
  { icon: Star, text: <><b className="font-semibold">4.8/5</b> from 850+ reviews</> },
  { icon: Check, text: <><b className="font-semibold">12,000+</b> tees delivered</> },
  { icon: Banknote, text: "Cash on Delivery island-wide" },
  { icon: CreditCard, text: "Pay in 3 with Koko or MintPay" },
];

export function OfferBanner({
  heading,
  blurb,
  offer,
}: {
  heading: string;
  /** The brand line. Null once a filter is on, where the heading names a
   *  design and a paragraph about the whole catalogue would be describing
   *  something the page is no longer showing. */
  blurb: string | null;
  /** The live markdown, from catalogueDiscount(). `pct: 0` means nothing is
   *  reduced and the panel is not rendered at all — an empty sale panel is
   *  worse than no panel, and inventing a figure to fill it is worse still. */
  offer: { pct: number; count: number };
}) {
  const onSale = offer.pct > 0;

  return (
    <section className="border-b bg-card">
      {/* Three parts in one grid rather than two stacked columns, because the
          phone order and the desktop order differ. On a phone a single column
          would put the sale panel under four trust signals — the furthest
          point from the headline, on the viewport that matters most — so the
          parts are placed explicitly: heading, offer, signals going down, and
          heading-over-signals beside the offer at lg. The columns are declared
          only when there is a panel to fill the second one. */}
      <div
        className={`mx-auto grid max-w-7xl gap-6 px-4 py-9 sm:px-6 md:py-11 lg:gap-x-16 lg:px-8 ${
          onSale ? "lg:grid-cols-[minmax(0,1fr)_21rem] lg:grid-rows-[auto_auto]" : ""
        }`}
      >
        <div className="order-1 lg:col-start-1 lg:row-start-1">
          <h1 className="font-heading text-[clamp(2.125rem,4.2vw,3.25rem)] font-bold leading-[1.02] tracking-[-0.03em]">
            {heading}
          </h1>
          {blurb && (
            <p className="mt-3 max-w-[46ch] text-[1.0625rem] leading-[1.55] text-muted-foreground">
              {blurb}
            </p>
          )}
        </div>

        {onSale && (
          // Cocoa, not terracotta: it is the same ground DealsSection uses at
          // the foot of the page, so the two read as one promotion rather than
          // two, and DealsCountdown's white-on-dark styling lands unchanged.
          // Terracotta stays what globals.css reserves it for — the price cut
          // itself, here on the button.
          <div className="order-2 rounded-2xl bg-primary p-6 text-primary-foreground shadow-card lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
            <p className="font-heading text-[1.5rem] font-semibold leading-tight tracking-[-0.01em]">
              Up to {offer.pct}% off
            </p>
            <p className="mt-1 text-sm text-primary-foreground/70">
              {offer.count} {offer.count === 1 ? "piece" : "pieces"} reduced right now.
            </p>
            <div className="mt-4">
              <DealsCountdown />
            </div>
            <Link
              href="/deals"
              className={`${buttonVariants({ variant: "brand", size: "lg" })} mt-4 w-full`}
            >
              Shop the sale
            </Link>
          </div>
        )}

        <ul className="order-3 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:col-start-1 lg:row-start-2 lg:max-w-xl lg:self-end">
          {SIGNALS.map(({ icon: Icon, text }, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm leading-[1.45]">
              <Icon
                className={`mt-px h-4 w-4 shrink-0 ${
                  Icon === Star ? "fill-[#f0b429] stroke-[#f0b429]" : "text-brand"
                }`}
                aria-hidden
              />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
