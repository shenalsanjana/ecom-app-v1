"use client";

import { useActionState, useState } from "react";
import { Star, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { submitReview, type ReviewFormState } from "@/app/products/[id]/actions";

const initialState: ReviewFormState = {};

export function ReviewForm({
  productId,
  defaultAuthorName,
}: {
  productId: string;
  defaultAuthorName: string;
}) {
  const action = submitReview.bind(null, productId);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);

  if (state.success) {
    return (
      <div className="rounded-lg border bg-green-50 p-6 text-center dark:bg-green-900/20">
        <CheckCircle className="mx-auto mb-3 h-10 w-10 text-green-600" />
        <p className="font-medium text-green-800 dark:text-green-200">
          Thanks! Your review will appear once we&apos;ve approved it.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="relative space-y-4 rounded-lg border p-6">
      <h3 className="font-heading text-lg font-semibold">Write a review</h3>

      {state.error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
          {state.error}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Rating</Label>
        <input type="hidden" name="rating" value={rating} />
        <div className="flex gap-1" role="group" aria-label="Star rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              aria-pressed={rating === n}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="p-0.5"
            >
              <Star
                className={cn(
                  "h-6 w-6 transition-colors",
                  (hover || rating) >= n
                    ? "fill-amber-400 stroke-amber-400"
                    : "fill-transparent stroke-muted-foreground",
                )}
              />
            </button>
          ))}
        </div>
        {state.fieldErrors?.rating && (
          <p className="text-xs text-red-600">{state.fieldErrors.rating[0]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="review-name">Name</Label>
        <Input id="review-name" name="authorName" defaultValue={defaultAuthorName} maxLength={80} />
        {state.fieldErrors?.authorName && (
          <p className="text-xs text-red-600">{state.fieldErrors.authorName[0]}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="review-title">Title (optional)</Label>
        <Input id="review-title" name="title" maxLength={120} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="review-body">Your review</Label>
        <Textarea id="review-body" name="body" rows={4} maxLength={2000} />
        {state.fieldErrors?.body && (
          <p className="text-xs text-red-600">{state.fieldErrors.body[0]}</p>
        )}
      </div>

      {/* Honeypot — off-screen; bots fill it, humans don't. */}
      <div className="absolute -left-[9999px] top-0" aria-hidden>
        <label>
          Company
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Submitting…" : "Submit review"}
      </Button>
    </form>
  );
}
