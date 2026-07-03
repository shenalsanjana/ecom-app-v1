import { prisma } from "@/app/_lib/prisma";
import { ReviewsModerationTable } from "@/app/_components/admin/reviews/reviews-moderation-table";

export default async function AdminReviewsPage() {
  const pending = await prisma.review.findMany({
    where: { approved: false, synthetic: false },
    orderBy: { createdAt: "desc" },
    include: { product: { select: { name: true } } },
  });
  const rows = pending.map((r) => ({
    id: r.id,
    productName: r.product.name,
    authorName: r.authorName,
    rating: r.rating,
    title: r.title,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
        <span className="text-sm text-muted-foreground">{rows.length} pending</span>
      </div>
      <ReviewsModerationTable rows={rows} />
    </section>
  );
}
