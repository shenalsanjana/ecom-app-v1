import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/app/_lib/auth";
import {
  getProductDetail,
  getProductReviews,
  getReviewHistogram,
} from "@/app/_lib/products";
import { getWishlistProductIds } from "@/app/_lib/wishlist";
import { stripMarkdown } from "@/app/_lib/strip-markdown";

import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { Breadcrumb } from "@/app/_components/product/breadcrumb";
import { ImageGallery } from "@/app/_components/product/image-gallery";
import { BuyBoxClient } from "@/app/_components/product/buy-box-client";
import { Description } from "@/app/_components/product/description";
import { ReviewsSection } from "@/app/_components/product/reviews-section";
import { RelatedStrip } from "@/app/_components/product/related-strip";

type Params = { id: string };
type SearchParams = { reviews?: string };

function clampReviews(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.min(Math.trunc(n), 100);
}

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { id } = await params;
  const detail = await getProductDetail(id);
  if (!detail) return { title: "Product not found — Dressing Bear" };
  return {
    title: detail.product.name,
    description: stripMarkdown(detail.product.description),
    openGraph: {
      title: detail.product.name,
      description: stripMarkdown(detail.product.description),
      images: [detail.product.image],
    },
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
  if (!detail) notFound();

  const shown = clampReviews(sp.reviews);
  const session = await auth();
  const userId = session?.user?.id;

  const [reviews, histogram, wishlistedIds] = await Promise.all([
    getProductReviews(id, shown),
    getReviewHistogram(id),
    userId ? getWishlistProductIds(userId) : Promise.resolve(new Set<string>()),
  ]);

  const fromPath = `/products/${id}`;

  return (
    <>
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
              images={detail.product.images}
              productName={detail.product.name}
              fallbackImage={detail.product.image}
            />
            <BuyBoxClient
              productId={detail.product.id}
              name={detail.product.name}
              price={detail.product.price}
              originalPrice={detail.product.originalPrice}
              image={detail.product.image}
              ratingAvg={detail.ratingAvg}
              ratingCount={detail.ratingCount}
              stock={detail.product.stock}
              wishlisted={wishlistedIds.has(detail.product.id)}
              isLoggedIn={!!session?.user}
              sizes={detail.product.sizes}
            />
          </div>
        </section>

        <div className="mx-auto max-w-7xl space-y-12 px-4 pb-16 sm:px-6 lg:px-8">
          <Description markdown={detail.product.description} />
          <ReviewsSection
            productId={detail.product.id}
            reviews={reviews}
            histogram={histogram}
            ratingAvg={detail.ratingAvg}
            ratingCount={detail.ratingCount}
            shown={shown}
          />
          <RelatedStrip
            products={detail.related}
            wishlistedIds={wishlistedIds}
            fromPath={fromPath}
          />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
