// app/_components/home/social-proof.tsx
// Social-proof band directly under the hero: the four signals a first-time
// visitor needs before scrolling. Deliberately does NOT repeat free shipping —
// the marquee and TrustStrip both already carry it.
import { Check, CreditCard, RotateCcw, Star } from "lucide-react";

export function SocialProof() {
  return (
    <section className="border-b bg-card">
      <ul className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-3.5 px-6 py-[18px] text-sm">
        <li className="flex items-center gap-2">
          <Star className="h-4 w-4 shrink-0 fill-[#f0b429] stroke-[#f0b429]" aria-hidden />
          <span>
            <b className="font-semibold">4.8/5</b> from 850+ reviews
          </span>
        </li>
        <li className="flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden />
          <span>
            <b className="font-semibold">12,000+</b> tees delivered
          </span>
        </li>
        <li className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 shrink-0 text-brand" aria-hidden />
          <span>Cash on Delivery island-wide</span>
        </li>
        <li className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4 shrink-0 text-brand" aria-hidden />
          <span>7-day easy returns</span>
        </li>
      </ul>
    </section>
  );
}
