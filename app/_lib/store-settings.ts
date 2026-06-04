// app/_lib/store-settings.ts
// Singleton StoreSettings accessor. One row (id = "singleton"), seeded lazily
// from DEFAULT_STORE_SETTINGS on first read so prod is byte-identical at rollout.
import { prisma } from "@/app/_lib/prisma";
import {
  COLOMBO_DELIVERY_COST,
  OTHER_DELIVERY_COST,
  FREE_DELIVERY_THRESHOLD,
  type DeliveryConfig,
} from "@/app/_lib/checkout-config";

export const STORE_SETTINGS_ID = "singleton";

// Seed values mirror today's site identity + checkout-config constants.
export const DEFAULT_STORE_SETTINGS = {
  storeName: "Dressing Bear",
  supportEmail: "dressingbear@gmail.com",
  supportPhone: "+94 74 054 5536",
  businessAddress: "Colombo, Sri Lanka",
  colomboDeliveryCost: COLOMBO_DELIVERY_COST,
  otherDeliveryCost: OTHER_DELIVERY_COST,
  freeDeliveryThreshold: FREE_DELIVERY_THRESHOLD,
};

export async function getStoreSettings() {
  const existing = await prisma.storeSettings.findUnique({ where: { id: STORE_SETTINGS_ID } });
  if (existing) return existing;
  try {
    return await prisma.storeSettings.create({
      data: { id: STORE_SETTINGS_ID, ...DEFAULT_STORE_SETTINGS },
    });
  } catch {
    // Concurrent first-read race: another request created it — re-read.
    const row = await prisma.storeSettings.findUnique({ where: { id: STORE_SETTINGS_ID } });
    if (row) return row;
    throw new Error("Failed to initialize store settings");
  }
}

export async function getDeliveryConfig(): Promise<DeliveryConfig> {
  const s = await getStoreSettings();
  return {
    colombo: s.colomboDeliveryCost,
    other: s.otherDeliveryCost,
    freeThreshold: s.freeDeliveryThreshold,
  };
}
