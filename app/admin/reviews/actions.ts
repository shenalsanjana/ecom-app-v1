"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";

export type ReviewModerationResult =
  | { success: true }
  | { success: false; error: string };

export async function approveReview(id: string): Promise<ReviewModerationResult> {
  await requireAdmin();
  try {
    await prisma.review.update({ where: { id }, data: { approved: true } });
  } catch {
    return { success: false, error: "Could not approve review." };
  }
  revalidatePath("/admin/reviews");
  revalidateTag("catalog", "max"); // refresh the four cached storefront review readers
  return { success: true };
}

export async function deleteReview(id: string): Promise<ReviewModerationResult> {
  await requireAdmin();
  try {
    await prisma.review.delete({ where: { id } });
  } catch {
    return { success: false, error: "Could not delete review." };
  }
  revalidatePath("/admin/reviews");
  return { success: true };
}
