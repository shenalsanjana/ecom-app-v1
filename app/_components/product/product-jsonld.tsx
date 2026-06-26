import type { Product } from "@prisma/client";
import { absoluteUrl } from "@/app/_lib/absolute-url";
import { stripMarkdown } from "@/app/_lib/strip-markdown";

// Emits Product JSON-LD for the product detail page. Helps Meta catalog
// matching plus Google/Pinterest rich results. Uses the same absolute-URL
// helper as the feed and share buttons so canonical URLs agree everywhere.
export function ProductJsonLd({
  product,
  ratingAvg,
  ratingCount,
}: {
  product: Pick<Product, "id" | "name" | "description" | "price" | "image" | "stock">;
  ratingAvg: number;
  ratingCount: number;
}) {
  const json: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    image: absoluteUrl(product.image),
    description: stripMarkdown(product.description, 5000),
    sku: product.id,
    mpn: product.id,
    brand: { "@type": "Brand", name: "Dressing Bear" },
    offers: {
      "@type": "Offer",
      url: absoluteUrl(`/products/${product.id}`),
      priceCurrency: "LKR",
      price: product.price.toFixed(2),
      availability: product.stock > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
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
      // JSON.stringify output is safe to inline; escape `<` defensively.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, "\\u003c") }}
    />
  );
}
