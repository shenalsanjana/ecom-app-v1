"use server";

import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { auth } from "@/app/_lib/auth";

export type ReviewFormState = {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Please select a star rating").max(5, "Please select a star rating"),
  title: z.string().trim().max(120).optional().transform((v) => (v ? v : null)),
  body: z.string().trim().min(10, "Review must be at least 10 characters").max(2000),
  authorName: z.string().trim().min(1, "Please enter your name").max(80),
});

export async function submitReview(
  productId: string,
  prevState: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  // Honeypot: a hidden field real users never fill. Pretend success and drop.
  if (((formData.get("company") as string) || "").trim() !== "") {
    return { success: true };
  }

  const session = await auth();

  const parsed = reviewSchema.safeParse({
    rating: formData.get("rating"),
    title: (formData.get("title") as string) || "",
    body: formData.get("body"),
    authorName:
      ((formData.get("authorName") as string) || "").trim() ||
      session?.user?.name ||
      "",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path[0] as string;
      (fieldErrors[path] ??= []).push(issue.message);
    }
    return { error: "Please fix the errors below", fieldErrors };
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) return { error: "Product not found." };

  try {
    await prisma.review.create({
      data: {
        productId,
        authorName: parsed.data.authorName,
        rating: parsed.data.rating,
        title: parsed.data.title,
        body: parsed.data.body,
        synthetic: false,
        approved: false,
      },
    });
  } catch {
    return { error: "Could not submit your review. Please try again." };
  }

  return { success: true };
}
