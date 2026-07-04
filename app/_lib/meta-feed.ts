// app/_lib/meta-feed.ts
// Pure mapping from our variant model to Meta's catalog CSV schema, plus CSV
// serialization. No DB access here — the Route Handler supplies rows. Kept pure
// so the price/sale/availability rules are unit-tested in isolation.
import { absoluteUrl } from "@/app/_lib/absolute-url";

export type FeedRow = {
  id: string;
  title: string;
  description: string;
  availability: string;
  condition: string;
  price: string;
  sale_price: string;
  link: string;
  image_link: string;
  brand: string;
  google_product_category: string;
  item_group_id: string;
};

export const FEED_COLUMNS = [
  "id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "sale_price",
  "link",
  "image_link",
  "brand",
  "google_product_category",
  "item_group_id",
] as const;

const BRAND = "Dressing Bear";
const GOOGLE_CATEGORY = "Apparel & Accessories > Clothing";

function money(value: number): string {
  return `${value.toFixed(2)} LKR`;
}

export type FeedVariant = {
  productId: string;
  productName: string;
  color: string;
  colorSlug: string;
  description: string;
  sku: string | null;
  price: number;                 // effective
  originalPrice: number | null;  // effective
  inStock: boolean;
  image: string;
};

export function variantToFeedRow(v: FeedVariant): FeedRow {
  const onSale = v.originalPrice != null && v.originalPrice > v.price;
  return {
    id: v.sku ?? `${v.productId}-${v.colorSlug}`,
    title: `${v.productName} - ${v.color}`,
    description: v.description.replace(/\s+/g, " ").trim(),
    availability: v.inStock ? "in stock" : "out of stock",
    condition: "new",
    // Meta convention: on sale, `price` is the was-price and `sale_price` the now-price.
    price: onSale ? money(v.originalPrice as number) : money(v.price),
    sale_price: onSale ? money(v.price) : "",
    link: absoluteUrl(`/products/${v.productId}?color=${v.colorSlug}`),
    image_link: absoluteUrl(v.image),
    brand: BRAND,
    google_product_category: GOOGLE_CATEGORY,
    // Shared across every color of a design — Meta's native variant grouping.
    item_group_id: v.productId,
  };
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function feedRowsToCsv(rows: FeedRow[]): string {
  const header = FEED_COLUMNS.join(",");
  const body = rows.map((row) =>
    FEED_COLUMNS.map((col) => csvCell(String(row[col as keyof FeedRow] ?? ""))).join(","),
  );
  return [header, ...body].join("\n") + "\n";
}
