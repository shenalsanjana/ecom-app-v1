"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { STORE_SETTINGS_ID, DEFAULT_STORE_SETTINGS } from "@/app/_lib/store-settings";

export type ActionResult = { success: true } | { success: false; error: string };

const StoreInfoSchema = z.object({
  storeName: z.string().trim().min(1, "Store name is required"),
  supportEmail: z.string().trim().email("Enter a valid email"),
  supportPhone: z.string().trim().min(1, "Support phone is required"),
  businessAddress: z.string().trim().min(1, "Business address is required"),
});

const DeliveryPricingSchema = z.object({
  colomboDeliveryCost: z.coerce.number().int().min(0, "Must be ≥ 0"),
  otherDeliveryCost: z.coerce.number().int().min(0, "Must be ≥ 0"),
  freeDeliveryThreshold: z.coerce.number().int().min(0, "Must be ≥ 0"),
});

// Delivery config feeds the global layout (announcement bar, cart, product copy),
// so revalidate the whole layout tree plus the settings page itself.
function revalidate() {
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}

async function save(data: Record<string, unknown>): Promise<ActionResult> {
  try {
    await prisma.storeSettings.upsert({
      where: { id: STORE_SETTINGS_ID },
      update: data,
      create: { id: STORE_SETTINGS_ID, ...DEFAULT_STORE_SETTINGS, ...data },
    });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidate();
  return { success: true };
}

export async function updateStoreInfo(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = StoreInfoSchema.safeParse({
    storeName: formData.get("storeName"),
    supportEmail: formData.get("supportEmail"),
    supportPhone: formData.get("supportPhone"),
    businessAddress: formData.get("businessAddress"),
  });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return save(parsed.data);
}

export async function updateDeliveryPricing(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = DeliveryPricingSchema.safeParse({
    colomboDeliveryCost: formData.get("colomboDeliveryCost"),
    otherDeliveryCost: formData.get("otherDeliveryCost"),
    freeDeliveryThreshold: formData.get("freeDeliveryThreshold"),
  });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  return save(parsed.data);
}
