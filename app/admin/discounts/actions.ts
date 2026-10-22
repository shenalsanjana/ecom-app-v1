"use server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { prisma } from "@/app/_lib/prisma";
import { DiscountInputSchema, toCents, type DiscountInput } from "@/app/_lib/discounts";
import { hasPaymentRestriction } from "@/app/_lib/discount-payment-methods";

const referenceSchema = z.object({ id: z.string().min(1).max(128), version: z.number().int().min(0).max(2_000_000_000) });

type Result = { success: true } | { success: false; error: string };
function refresh() { revalidatePath("/admin/discounts"); revalidateTag("promotions", { expire: 0 }); }
function failure(error: unknown): Result {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { success: false, error: "That coupon code is already in use." };
  return { success: false, error: error instanceof Error && error.message.startsWith("Please") ? error.message : "Could not save this offer. Refresh and try again." };
}
export async function saveDiscount(id: string | null, version: number | null, input: DiscountInput): Promise<Result> {
  await requireAdmin();
  if (id !== null && !referenceSchema.safeParse({ id, version }).success) return { success: false, error: "Invalid offer reference" };
  if (id === null && version !== null) return { success: false, error: "Invalid offer reference" };
  const parsed = DiscountInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid offer" };
  const v = parsed.data;
  try {
    await prisma.$transaction(async tx => {
      const productIds = [...new Set(v.productIds)];
      const categorySlugs = [...new Set(v.categorySlugs)];
      if (v.scope === "PRODUCTS" && await tx.product.count({ where: { id: { in: productIds }, archived: false } }) !== productIds.length) throw new Error("Please remove unavailable products and select existing products.");
      if (v.scope === "CATEGORIES" && await tx.design.count({ where: { slug: { in: categorySlugs } } }) !== categorySlugs.length) throw new Error("Please select existing collections.");
      const data = {
        name: v.name, code: v.code || null, type: v.type, scope: v.scope, value: toCents(v.value), active: v.active,
        publicOffer: !!v.code && v.publicOffer === true,
        ...(id && v.paymentMethods === undefined ? {} : { paymentMethods: v.paymentMethods?.includes("ALL") || !hasPaymentRestriction(v) ? [] : [...new Set(v.paymentMethods)] }),
        startsAt: v.startsAt ? new Date(v.startsAt) : null, expiresAt: v.expiresAt ? new Date(v.expiresAt) : null,
        usageLimit: v.usageLimit, minimumOrder: toCents(v.minimumOrder), maximumDiscount: v.maximumDiscount === null ? null : toCents(v.maximumDiscount),
      };
      let discountId = id;
      if (id) {
        const result = await tx.discount.updateMany({ where: { id, version: version ?? -1, ...(v.usageLimit === null ? {} : { usedCount: { lte: v.usageLimit } }) }, data: { ...data, version: { increment: 1 } } });
        if (result.count !== 1) throw new Error("Please refresh this offer. It changed, or the usage limit is below its recorded uses.");
        await tx.discountProduct.deleteMany({ where: { discountId: id } });
        await tx.discountCategory.deleteMany({ where: { discountId: id } });
      } else discountId = (await tx.discount.create({ data })).id;
      if (v.scope === "PRODUCTS") await tx.discountProduct.createMany({ data: productIds.map(productId => ({ discountId: discountId!, productId })) });
      if (v.scope === "CATEGORIES") await tx.discountCategory.createMany({ data: categorySlugs.map(designSlug => ({ discountId: discountId!, designSlug })) });
    });
    refresh(); return { success: true };
  } catch (error) { return failure(error); }
}
export async function setDiscountActive(id: string, version: number, active: boolean): Promise<Result> {
  await requireAdmin();
  if (typeof active !== "boolean" || !referenceSchema.safeParse({ id, version }).success) return { success: false, error: "Invalid offer" };
  try {
    const result = await prisma.discount.updateMany({ where: { id, version }, data: { active, version: { increment: 1 } } });
    if (!result.count) return { success: false, error: "This offer changed. Refresh and try again." };
    refresh(); return { success: true };
  } catch { return { success: false, error: "Could not update this offer. Try again." }; }
}
export async function deleteDiscount(id: string, version: number): Promise<Result> {
  await requireAdmin();
  if (!referenceSchema.safeParse({ id, version }).success) return { success: false, error: "Invalid offer reference" };
  try {
    const result = await prisma.discount.deleteMany({ where: { id, version } });
    if (!result.count) return { success: false, error: "This offer changed. Refresh and try again." };
    refresh(); return { success: true };
  } catch { return { success: false, error: "Could not delete this offer." }; }
}
