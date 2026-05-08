// app/wishlist/actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/app/_lib/auth";
import { prisma } from "@/app/_lib/prisma";

export async function toggleWishlistAction(formData: FormData): Promise<void> {
  const productId = formData.get("productId");
  const fromPath = (formData.get("fromPath") as string) || "/";
  if (typeof productId !== "string" || !productId) return;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(fromPath)}`);
  }
  const userId = session.user.id;

  const existing = await prisma.wishlistItem.findUnique({
    where: { userId_productId: { userId, productId } },
  });

  if (existing) {
    await prisma.wishlistItem.delete({ where: { id: existing.id } });
  } else {
    await prisma.wishlistItem.create({ data: { userId, productId } });
  }

  // Only bust /wishlist's router cache — that's the one page whose SSR'd
  // content depends on the user's wishlist set. Heart fill on every other
  // surface (home, PDP, categories, deals, search) hydrates client-side
  // from useWishlist(), so busting those routes' caches would be wrong:
  // it would nuke the home-page ISR cache on every toggle from any user.
  // See openspec/changes/perf-isr-public-catalog/design.md.
  revalidatePath("/wishlist");
}
