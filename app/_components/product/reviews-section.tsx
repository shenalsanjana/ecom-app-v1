import Link from "next/link";
import { Star } from "lucide-react";
import type { Review } from "@prisma/client";
import type { ReviewHistogram } from "@/app/_lib/products";

type Props = {
  productId: string;
  reviews: Review[];
  histogram: ReviewHistogram;
  ratingAvg: number;
  ratingCount: number;
  shown: number;
};

function StarRow({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span
      role="img"
      aria-label={`Rating: ${value} out of ${max}`}
      className="inline-flex"
    >
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          aria-hidden
          className={
            "h-3.5 w-3.5 " +
            (i < value
              ? "fill-amber-400 stroke-amber-400"
              : "fill-transparent stroke-muted-foreground")
          }
        />
      ))}
    </span>
  );
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

export function ReviewsSection({
  productId, reviews, histogram, ratingAvg, ratingCount, shown,
}: Props) {
  const hasReviews = ratingCount > 0;
  const moreAvailable = reviews.length < ratingCount;

  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="space-y-6">
      <h2 id="reviews-heading" className="font-heading text-xl font-medium tracking-tight">
        Customer reviews
      </h2>

      {!hasReviews ? (
        <p className="text-sm text-muted-foreground">No reviews yet.</p>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
            <div className="space-y-1">
              <div className="font-heading text-4xl font-semibold tabular-nums">{ratingAvg.toFixed(1)}</div>
              <StarRow value={Math.round(ratingAvg)} />
              <div className="text-xs text-muted-foreground">
                {ratingCount.toLocaleString()} reviews
              </div>
            </div>
            <div className="space-y-1.5">
              {([5, 4, 3, 2, 1] as const).map((star) => {
                const n = histogram[star];
                const pct = ratingCount > 0 ? (n / ratingCount) * 100 : 0;
                return (
                  <div key={star} className="flex items-center gap-2 text-xs">
                    <span className="w-6 tabular-nums">{star}★</span>
                    <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                      <div
                        className="h-full bg-amber-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-10 text-right tabular-nums text-muted-foreground">
                      {n.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <ul className="space-y-5 border-t pt-5">
            {reviews.map((r) => (
              <li key={r.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{r.authorName}</span>
                  <span>{formatDate(r.createdAt)}</span>
                </div>
                <StarRow value={r.rating} />
                {r.title && <p className="font-medium">{r.title}</p>}
                <p className="text-sm leading-relaxed">{r.body}</p>
              </li>
            ))}
          </ul>

          {moreAvailable && (
            <div>
              <Link
                href={`/products/${productId}?reviews=${shown + 5}#reviews`}
                className="text-sm font-medium underline-offset-4 hover:underline"
              >
                Show more reviews
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
