"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { approveReview, deleteReview } from "@/app/admin/reviews/actions";

export type ModerationRow = {
  id: string;
  productName: string;
  authorName: string;
  rating: number;
  title: string | null;
  body: string;
  createdAt: string;
};

export function ReviewsModerationTable({ rows }: { rows: ModerationRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No reviews awaiting approval.</p>;
  }

  function run(
    id: string,
    fn: () => Promise<{ success: boolean; error?: string }>,
    ok: string,
  ) {
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      if (res.success) toast.success(ok);
      else toast.error(res.error ?? "Something went wrong");
      setBusyId(null);
      router.refresh();
    });
  }

  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li key={r.id} className="rounded-lg border p-4">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium">{r.productName}</span>
            <span className="text-muted-foreground">
              {new Date(r.createdAt).toLocaleDateString()}
            </span>
          </div>
          <div className="mb-1 flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                aria-hidden
                className={
                  "h-3.5 w-3.5 " +
                  (i < r.rating
                    ? "fill-amber-400 stroke-amber-400"
                    : "fill-transparent stroke-muted-foreground")
                }
              />
            ))}
            <span className="ml-2 text-sm text-muted-foreground">{r.authorName}</span>
          </div>
          {r.title && <p className="font-medium">{r.title}</p>}
          <p className="text-sm leading-relaxed">{r.body}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending && busyId === r.id}
              onClick={() => run(r.id, () => approveReview(r.id), "Review approved")}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={pending && busyId === r.id}
              onClick={() => run(r.id, () => deleteReview(r.id), "Review deleted")}
              className="rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
