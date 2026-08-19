// app/checkout/actions.ts
"use server";

import { z } from "zod";
import { LkPhoneSchema, LkMobileSchema } from "@/app/_lib/validation";
import { validateCartItems, type VariantStock } from "@/app/_lib/order-validation";
import {
  sendPendingPrepaidNotificationEmail,
  sendAdminFailureAlertEmail,
  logMailerError,
  type OrderItem,
  type OrderDetails,
} from "@/app/_lib/mailer";
import { notifyOrderConfirmed } from "@/app/_lib/order-notifications";
import { prisma } from "@/app/_lib/prisma";
import { getVerifiedSessionUser } from "@/app/_lib/session-user";
import { calculateDelivery } from "@/app/_lib/checkout-config";
import { getDeliveryConfig } from "@/app/_lib/store-settings";
import { zoneForCity } from "@/app/_lib/delivery-zones";
import { initialPaymentStatus } from "@/app/_lib/order-status";
import { nextWebNumber } from "@/app/_lib/web-number";
import { acquireItemPools, InsufficientStockError } from "@/app/_lib/inventory-pools";
import { buildPlainStockMap, buildDesignStockMap, plainStockKey } from "@/app/_lib/variants";

export type PaymentMethod = "COD" | "PAYHERE" | "KOKO" | "MINTPAY";

export type CheckoutResult =
  | { success: true; orderId: string; webNumber?: string | null; trackingCode?: string; isGuest?: boolean }
  | { success: false; error: string };

const PAYMENT_METHOD_DISPLAY: Record<PaymentMethod, string> = {
  COD: "Cash on Delivery",
  PAYHERE: "Credit / Debit Card",
  KOKO: "Koko",
  MINTPAY: "Mintpay",
};

const ItemInputSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  color: z.string().nullable().optional(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive(),
  size: z.string().nullable().optional(),
});

const AddressSchema = z.object({
  line1: z.string().trim().min(1, "Address line 1 is required"),
  line2: z.string().optional(),
  city: z.string().trim().min(1, "City is required"),
  country: z.string().trim().min(1),
});

const GuestInfoSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  phone: LkMobileSchema,
});

const ProcessOrderSchema = z.object({
  items: z.array(ItemInputSchema).min(1, "Cart is empty"),
  shippingAddress: AddressSchema,
  paymentMethod: z.enum(["COD", "PAYHERE", "KOKO", "MINTPAY"]),
  contactPhone: LkMobileSchema,
  alternatePhone: LkPhoneSchema.optional(),
  guestInfo: GuestInfoSchema.optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  notes: z.string().trim().max(500).optional(),
});

export type ProcessOrderInput = z.infer<typeof ProcessOrderSchema>;

/**
 * Internal helper for post-create side effects. No order is auto-booked at
 * checkout under the manual lifecycle: COD orders just log and await manual
 * dispatch; prepaid orders send a pending-payment notification to the brand.
 * Never throws — failures are logged and alerts sent to admin. Always resolves
 * undefined (no tracking code is produced at checkout anymore); the return type
 * is retained for the caller's existing trackingCode plumbing.
 */
async function orchestrateCourierBooking(orderId: string, details: OrderDetails): Promise<string | undefined> {
  try {
    if (details.paymentMethod === "COD") {
      // COD orders are no longer auto-booked at checkout — the admin dispatches
      // them manually from the orders list (manual lifecycle). The confirmation
      // email is still sent by the caller, now without a tracking code.
      console.log("[checkout] COD order awaiting manual dispatch", { orderId });
    } else {
      // Prepaid flow: send pending notification to brand
      console.log("[checkout] Skipped courier automation: awaiting payment confirmation", {
        orderId,
        paymentMethod: details.paymentMethod,
      });
      try {
        await sendPendingPrepaidNotificationEmail({ order: details });
      } catch (err) {
        logMailerError(
          "pending-prepaid",
          { orderId, webNumber: details.webNumber, rbNumber: details.rbNumber },
          err,
        );
      }
    }
  } catch (err) {
    // Top-level catch to ensure no failure ever bubbles up to the customer.
    console.error("[checkout] orchestrateCourierBooking top-level failure:", err);
    try {
      await sendAdminFailureAlertEmail({
        orderId,
        step: "orchestrate-courier",
        reason: err instanceof Error ? err.message : String(err),
        order: details,
        errorDetail: err instanceof Error ? err.stack : undefined,
      });
    } catch (alertErr) {
      logMailerError(
        "admin-failure-alert",
        { orderId, webNumber: details.webNumber, rbNumber: details.rbNumber },
        alertErr,
      );
    }
  }
  return undefined;
}

export async function processOrder(input: ProcessOrderInput): Promise<CheckoutResult> {
  const parsed = ProcessOrderSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { success: false, error: first?.message ?? "Invalid order data" };
  }
  const { items, shippingAddress, paymentMethod, contactPhone, alternatePhone, guestInfo, idempotencyKey, notes } =
    parsed.data;

  let userId: string | null = null;
  let customerName: string;
  let customerEmail: string;
  let guestName: string | null = null;
  let guestEmail: string | null = null;

  // Verified against the database rather than trusted from the JWT. The session
  // cookie (app/_lib/auth.config.ts: strategy "jwt", 30-day maxAge) can name a
  // User row that no longer exists, and passing that id to order.create violates
  // `Order_userId_fkey` — which took down the entire checkout. See
  // app/_lib/session-user.ts for the full reasoning.
  //
  // When the row is gone we fall through to the guest branch below. The checkout
  // page already renders the guest form in that state (resolveCheckoutPrefill
  // returns null), so guestInfo is present and the sale is not lost.
  const sessionUser = await getVerifiedSessionUser();

  if (sessionUser) {
    userId = sessionUser.id;
    const sessionName = sessionUser.name?.trim();
    if (!sessionName) {
      return {
        success: false,
        error: "Please add your name to your profile before checking out",
      };
    }
    customerName = sessionName;
    customerEmail = sessionUser.email ?? "";
  } else if (guestInfo) {
    const email = guestInfo.email && guestInfo.email.length > 0 ? guestInfo.email : null;
    customerName = guestInfo.name;
    customerEmail = email ?? "";
    guestName = guestInfo.name;
    guestEmail = email;
  } else {
    return {
      success: false,
      error: "Please sign in or provide your name and email to continue",
    };
  }

  // Idempotency: if the same submission is retried, return the existing order.
  if (idempotencyKey) {
    const existing = await prisma.order.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return {
        success: true,
        orderId: existing.id,
        webNumber: existing.webNumber,
        trackingCode: existing.trackingCode ?? undefined,
        isGuest: !existing.userId,
      };
    }
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryConfig = await getDeliveryConfig();
  const shippingCost = calculateDelivery(subtotal, zoneForCity(shippingAddress.city), deliveryConfig, paymentMethod);
  const total = subtotal + shippingCost;
  const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  // Validate each line against the two raw-material pools its variant/design draw from.
  const variantIds = Array.from(new Set(items.map((i) => i.variantId)));
  const dbVariants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: {
      id: true,
      productId: true,
      color: true,
      colorSlug: true,
      sku: true,
      sizeStocks: { select: { size: true } },
      product: { select: { dtfDesignId: true } },
    },
  });
  const variantMap = new Map<
    string,
    VariantStock & { productId: string; color: string; colorSlug: string; sku: string | null }
  >(
    dbVariants.map((v) => [
      v.id,
      {
        productId: v.productId,
        color: v.color,
        colorSlug: v.colorSlug,
        sku: v.sku,
        dtfDesignId: v.product.dtfDesignId,
        sizes: v.sizeStocks,
      },
    ]),
  );
  for (const item of items) {
    const variant = variantMap.get(item.variantId);
    if (variant && variant.productId !== item.productId) {
      return { success: false, error: `Selected variant does not belong to "${item.name}"` };
    }
  }
  const [plainStockRows, designStockRows] = await Promise.all([
    prisma.plainTshirtStock.findMany({ select: { id: true, colorSlug: true, size: true, quantity: true } }),
    prisma.dtfDesign.findMany({ select: { id: true, quantity: true } }),
  ]);
  const plainStock = buildPlainStockMap(plainStockRows);
  const designStock = buildDesignStockMap(designStockRows);
  const validationError = validateCartItems(
    items.map((item) => ({ ...item, size: item.size ?? null })),
    variantMap,
    plainStock,
    designStock,
  );
  if (validationError) return { success: false, error: validationError };

  // Create the order + acquire both raw-material pools atomically. Each
  // guarded decrement re-checks the row's current quantity, so concurrent
  // purchases of the last unit can't oversell.
  let created: { webNumber: string | null; paymentStatus: string | null };
  try {
    created = await prisma.$transaction(async (tx) => {
      const poolByIndex = new Map<number, { plainTshirtStockId: string | null; dtfDesignId: string | null }>();
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.size) continue; // sizeless variants carry no per-size pool
        const variant = variantMap.get(item.variantId)!;
        const plainEntry = plainStock.get(plainStockKey(variant.colorSlug, item.size));
        const pool = { plainTshirtStockId: plainEntry?.id ?? null, dtfDesignId: variant.dtfDesignId };
        await acquireItemPools(tx, { ...pool, quantity: item.quantity, name: item.name });
        poolByIndex.set(i, pool);
      }

      const webNumber = await nextWebNumber(tx);
      const paymentStatus = initialPaymentStatus(paymentMethod);

      return tx.order.create({
        data: {
          id: orderId,
          userId,
          guestName,
          guestEmail,
          customerPhone: contactPhone,
          alternatePhone: alternatePhone ?? null,
          shippingLine1: shippingAddress.line1,
          shippingLine2: shippingAddress.line2 ?? null,
          shippingCity: shippingAddress.city,
          shippingCountry: shippingAddress.country,
          subtotal,
          shippingCost,
          total,
          paymentMethod,
          paymentMethodDisplay: PAYMENT_METHOD_DISPLAY[paymentMethod],
          status: "PENDING",
          paymentStatus,
          webNumber,
          idempotencyKey: idempotencyKey ?? null,
          notes: notes && notes.length > 0 ? notes : null,
          items: {
            create: items.map((item, i) => ({
              productId: item.productId,
              variantId: item.variantId,
              color: variantMap.get(item.variantId)?.color ?? null,
              sku: variantMap.get(item.variantId)?.sku ?? null,
              name: item.name,
              size: item.size ?? null,
              price: item.price,
              quantity: item.quantity,
              plainTshirtStockId: poolByIndex.get(i)?.plainTshirtStockId ?? null,
              dtfDesignId: poolByIndex.get(i)?.dtfDesignId ?? null,
            })),
          },
        },
      });
    });
  } catch (error) {
    // Stock shortfalls are written for the shopper and name the item, so pass
    // them straight through. Everything else is an internal fault: log it with
    // context (this catch previously logged nothing, leaving production failures
    // invisible) and show the shopper a safe message rather than raw Prisma
    // internals.
    if (error instanceof InsufficientStockError) {
      return { success: false, error: error.message };
    }
    console.error("[checkout] order creation failed", {
      orderId,
      hasUserId: Boolean(userId),
      idempotencyKey: idempotencyKey ?? null,
      // Error instances serialize to `{}` through JSON log pipelines — pull the
      // message and stack out explicitly so the log is actually diagnosable.
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return {
      success: false,
      error: "We couldn't complete your order. Please try again, or contact us if the problem continues.",
    };
  }

  // ── Branch on payment method (Option B2) ────────────────────────────
  const orderItems: OrderItem[] = items.map((item) => {
    const variant = variantMap.get(item.variantId);
    return {
      name: item.name,
      color: variant?.color ?? null,
      sku: variant?.sku ?? null,
      size: item.size ?? null,
      price: item.price,
      quantity: item.quantity,
    };
  });

  const orderDetailsForEmail: OrderDetails = {
    orderId,
    customerName,
    customerEmail,
    customerPhone: contactPhone,
    alternatePhone: alternatePhone ?? null,
    items: orderItems,
    subtotal,
    shipping: shippingCost,
    total,
    shippingAddress,
    paymentMethod,
    paymentMethodDisplay: PAYMENT_METHOD_DISPLAY[paymentMethod],
    notes: notes && notes.length > 0 ? notes : undefined,
    webNumber: created.webNumber,
    paymentStatus: created.paymentStatus,
  };

  // Synchronous booking with non-blocking failure
  const trackingCode = await orchestrateCourierBooking(orderId, orderDetailsForEmail);

  // For COD: send confirmation email immediately (payment collected at delivery).
  // For prepaid (PAYHERE/KOKO/MINTPAY): confirmation email is sent by the
  // webhook handler only after payment is verified — do NOT send it here.
  if (paymentMethod === "COD") {
    try {
      await notifyOrderConfirmed({ ...orderDetailsForEmail, trackingCode });
    } catch (error) {
      logMailerError("order-confirmation", { orderId, webNumber: created.webNumber }, error);
    }
  }

  return { success: true, orderId, webNumber: created.webNumber, trackingCode, isGuest: !userId };
}

