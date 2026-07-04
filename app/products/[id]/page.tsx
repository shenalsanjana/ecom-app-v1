import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";

import {
  getProductDetail,
  getProductReviews,
  getReviewHistogram,
  getProductSlugRedirect,
} from "@/app/_lib/products";
import { stripMarkdown } from "@/app/_lib/strip-markdown";
import { formatPrice } from "@/app/_lib/format";
import { absoluteUrl } from "@/app/_lib/absolute-url";
import { ProductJsonLd } from "@/app/_components/product/product-jsonld";
import { auth } from "@/app/_lib/auth";

export const revalidate = 300;

import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { Breadcrumb } from "@/app/_components/product/breadcrumb";
import { ImageGallery } from "@/app/_components/product/image-gallery";
import { BuyBoxClient } from "@/app/_components/product/buy-box-client";
import { Description } from "@/app/_components/product/description";
import { ReviewsSection } from "@/app/_components/product/reviews-section";
import { RelatedStrip } from "@/app/_components/product/related-strip";

type Params = { id: string };
type SearchParams = { reviews?: string; color?: string };

function clampReviews(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.min(Math.trunc(n), 100);
}

export async function generateMetadata(
  { params, searchParams }: { params: Promise<Params>; searchParams: Promise<SearchParams> },
): Promise<Metadata> {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const detail = await getProductDetail(id);
  if (!detail) {
    const dest = await getProductSlugRedirect(id);
    if (dest) permanentRedirect(`/products/${dest}`);
    return { title: { absolute: "Product not found — Dressing Bear" } };
  }
  const variant = detail.variants.find((v) => v.colorSlug === sp.color) ?? detail.variants[0];
  const priceTitle = `${detail.product.name} — ${formatPrice(variant.price)}`;
  const description = stripMarkdown(detail.product.description);
  const imageUrl = absoluteUrl(variant.detailImages[0] ?? "");
  return {
    title: { absolute: `${priceTitle} | Dressing Bear` },
    description,
    openGraph: {
      title: priceTitle,
      description,
      images: [{ url: imageUrl, width: 1200, height: 1500, alt: detail.product.name }],
    },
    twitter: { card: "summary_large_image", title: priceTitle, description, images: [imageUrl] },
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const detail = await getProductDetail(id);
  if (!detail) {
    const dest = await getProductSlugRedirect(id);
    if (dest) permanentRedirect(`/products/${dest}`);
    notFound();
  }

  const session = await auth();

  const shown = clampReviews(sp.reviews);

  const [reviews, histogram] = await Promise.all([
    getProductReviews(id, shown),
    getReviewHistogram(id),
  ]);

  const fromPath = `/products/${id}`;

  return (
    <>
      <ProductJsonLd
        product={{ id: detail.product.id, name: detail.product.name, description: detail.product.description }}
        variants={detail.variants}
        ratingAvg={detail.ratingAvg}
        ratingCount={detail.ratingCount}
      />
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Breadcrumb
            categorySlug={detail.product.categorySlug}
            categoryName={detail.product.category.name}
            productName={detail.product.name}
          />
        </div>

        <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr] lg:gap-12">
            <ImageGallery
              variants={detail.variants.map((v) => ({ colorSlug: v.colorSlug, detailImages: v.detailImages }))}
              defaultColorSlug={detail.variants[0].colorSlug}
              productName={detail.product.name}
              fallbackImage={detail.variants[0].detailImages[0] ?? ""}
            />
            <BuyBoxClient
              productId={detail.product.id}
              name={detail.product.name}
              variants={detail.variants}
              defaultColorSlug={detail.variants[0].colorSlug}
              ratingAvg={detail.ratingAvg}
              ratingCount={detail.ratingCount}
              shareUrl={absoluteUrl(`/products/${detail.product.id}`)}
            />
          </div>
        </section>

        <div className="mx-auto max-w-7xl space-y-12 px-4 pb-28 sm:px-6 lg:pb-16 lg:px-8">
          <Description markdown={detail.product.description} />
          <ReviewsSection
            productId={detail.product.id}
            reviews={reviews}
            histogram={histogram}
            ratingAvg={detail.ratingAvg}
            ratingCount={detail.ratingCount}
            shown={shown}
            defaultAuthorName={session?.user?.name ?? ""}
          />
          <RelatedStrip
            products={detail.related}
            fromPath={fromPath}
          />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
