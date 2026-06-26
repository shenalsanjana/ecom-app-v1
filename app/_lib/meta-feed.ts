// app/_lib/meta-feed.ts
// Pure mapping from our Product model to Meta's catalog CSV schema, plus CSV
// serialization. No DB access here — the Route Handler supplies rows. Kept pure
// so the price/sale/availability rules are unit-tested in isolation.
import { absoluteUrl } from "@/app/_lib/absolute-url";

export type FeedProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice: number | null;
  stock: number;
  image: string;
  archived: boolean;
};

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

export function productToFeedRow(p: FeedProduct): FeedRow {
  const onSale = p.originalPrice != null && p.originalPrice > p.price;
  return {
    id: p.id,
    title: p.name,
    // Newlines break CSV rows; collapse to spaces.
    description: p.description.replace(/\s+/g, " ").trim(),
    availability: p.stock > 0 ? "in stock" : "out of stock",
    condition: "new",
    // Meta convention is inverted from our model: when on sale the "price" is
    // the original (was) price and "sale_price" is what the customer pays.
    price: onSale ? money(p.originalPrice as number) : money(p.price),
    sale_price: onSale ? money(p.price) : "",
    link: absoluteUrl(`/products/${p.id}`),
    image_link: absoluteUrl(p.image),
    brand: BRAND,
    google_product_category: GOOGLE_CATEGORY,
    item_group_id: p.id,
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
