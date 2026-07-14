import { absoluteUrl } from "@/app/_lib/absolute-url";
import { stripMarkdown } from "@/app/_lib/strip-markdown";
import { variantInStock, buildPlainStockMap, buildDesignStockMap } from "@/app/_lib/variants";
import type { VariantDetail } from "@/app/_lib/products";

// Emits Product JSON-LD with one Offer per color variant (shared design, many
// colors) for Meta/Google/Pinterest rich results.
export function ProductJsonLd({
  product,
  variants,
  plainStockRows,
  designStockRows,
  ratingAvg,
  ratingCount,
}: {
  product: { id: string; name: string; description: string };
  variants: VariantDetail[];
  plainStockRows: { id: string; colorSlug: string; size: string; quantity: number }[];
  designStockRows: { id: string; quantity: number }[];
  ratingAvg: number;
  ratingCount: number;
}) {
  const plainStock = buildPlainStockMap(plainStockRows);
  const designStock = buildDesignStockMap(designStockRows);
  const primary = variants[0];
  const images = variants.flatMap((v) => v.detailImages).slice(0, 6).map((u) => absoluteUrl(u));
  const json: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    image: images.length > 0 ? images : undefined,
    description: stripMarkdown(product.description, 5000),
    brand: { "@type": "Brand", name: "Dressing Bear" },
    sku: primary?.sku ?? product.id,
    mpn: primary?.sku ?? product.id,
    offers: variants.map((v) => ({
      "@type": "Offer",
      url: absoluteUrl(`/products/${product.id}?color=${v.colorSlug}`),
      priceCurrency: "LKR",
      price: v.price.toFixed(2),
      sku: v.sku ?? `${product.id}-${v.colorSlug}`,
      availability: variantInStock(v.sizeStocks, v.colorSlug, v.dtfDesignId, plainStock, designStock)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    })),
  };

  if (ratingCount > 0) {
    json.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: ratingAvg.toFixed(1),
      reviewCount: ratingCount,
    };
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, "\\u003c") }}
    />
  );
}
