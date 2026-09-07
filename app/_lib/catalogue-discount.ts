// app/_lib/catalogue-discount.ts
// The offer banner's headline figure, derived from the catalogue that page
// has already read — no extra query, no new cache key.
//
// Every number here comes off real rows for the same reason product-signals.ts
// gives for "Only N left": a headline discount is shown to real customers, so a
// hardcoded "Up to 40% off" is a fabricated claim, not a placeholder. When
// nothing is reduced this returns 0 and the banner says nothing about a sale.
import { discountPct } from "@/app/_lib/pricing";

type Discountable = {
  variants: { price: number; originalPrice: number | null }[];
};

export type CatalogueDiscount = {
  /** The largest whole-percent cut visible on any card. 0 when none is. */
  pct: number;
  /** How many products carry any reduction at all. */
  count: number;
};

/** Reads the variants rather than the product row: a variant can override both
 *  price and originalPrice (see effectivePrice in variants.ts), so the product
 *  row's pair is not always what a card ends up showing. Taking the best cut
 *  across a product's variants matches what a shopper can actually find. */
export function catalogueDiscount(products: Discountable[]): CatalogueDiscount {
  let pct = 0;
  let count = 0;

  for (const p of products) {
    let best = 0;
    for (const v of p.variants) {
      if (v.originalPrice == null) continue;
      const d = discountPct(v.price, v.originalPrice);
      if (d > best) best = d;
    }
    if (best > 0) {
      count += 1;
      if (best > pct) pct = best;
    }
  }

  return { pct, count };
}
