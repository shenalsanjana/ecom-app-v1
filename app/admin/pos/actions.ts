"use server";

import { getDeliveryConfig } from "@/app/_lib/store-settings";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { invalidateStock } from "@/app/_lib/invalidate-stock";
import { InsufficientStockError } from "@/app/_lib/inventory-pools";
import { PublicationError } from "@/app/_lib/product-publication";
import { PosError, PosSaleSchema, type PosSaleInput, type PosSaleResult } from "@/app/_lib/pos";
import { getPosProducts, savePosSale } from "@/app/_lib/pos-service";

export async function searchPosProducts(query: string) {
  await requireAdmin();
  return getPosProducts(typeof query === "string" ? query : "");
}

export async function completePosSale(input: PosSaleInput): Promise<PosSaleResult> {
  const session = await requireAdmin();
  const parsed = PosSaleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Check the sale details." };
  let result;
  try {
    result = await savePosSale(parsed.data, session.user!.id!);
  } catch (error) {
    if (error instanceof PosError || error instanceof InsufficientStockError || error instanceof PublicationError) {
      return { success: false, error: error.message };
    }
    console.error("[pos] Sale failed", { code: (error as { code?: string }).code });
    return { success: false, uncertain: true, error: "The sale could not be confirmed. Retry with the same details to avoid a duplicate sale." };
  }
  // A cache failure after commit must not turn a completed payment into an error.
  try {
    invalidateStock();
    revalidatePath("/admin/orders");
    revalidatePath("/admin/pos");
  } catch { console.error("[pos] Sale saved; cache refresh failed", { orderId: result.orderId }); }
  return { success: true, ...result };
}

export async function getPosDeliveryConfig() {
  await requireAdmin();
  return getDeliveryConfig();
}
