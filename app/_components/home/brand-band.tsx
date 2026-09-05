// app/_components/home/brand-band.tsx
import { Banknote, Check, CreditCard, Star } from "lucide-react";

/** The masthead of the shop-all home page.
 *
 *  Replaces three stacked bands the old marketing home page opened with — a
 *  640px photo hero, the SocialProof strip under it, and the browse page's own
 *  "All products" heading — with one ~200px band that does all three jobs. The
 *  point is the fold: with the hero in place the first product card started
 *  around 900px down, so a phone met a photo and a slogan before it met
 *  anything it could buy.
 *
 *  It carries the page's <h1>, so the catalogue below it must not render one.
 *  The heading is the department or design name once a filter is on, which is
 *  why it arrives as a prop rather than being fixed here.
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

export function BrandBand({
  heading,
  blurb,
}: {
  heading: string;
  /** The brand line. Null once a filter is on, where the heading names a
   *  design and a paragraph about the whole catalogue would be describing
   *  something the page is no longer showing. */
  blurb: string | null;
}) {
  return (
    <section className="border-b bg-card">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-9 sm:px-6 md:py-11 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16 lg:px-8">
        <div>
          <h1 className="font-heading text-[clamp(2.125rem,4.2vw,3.25rem)] font-bold leading-[1.02] tracking-[-0.03em]">
            {heading}
          </h1>
          {blurb && (
            <p className="mt-3 max-w-[46ch] text-[1.0625rem] leading-[1.55] text-muted-foreground">
              {blurb}
            </p>
          )}
        </div>

        <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:shrink-0">
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
