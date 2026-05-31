// app/checkout/actions.ts
"use server";

import { z } from "zod";
import { LkPhoneSchema } from "@/app/_lib/validation";
import { auth } from "@/app/_lib/auth";
import {
  sendOrderConfirmationEmail,
  sendPendingPrepaidNotificationEmail,
  sendAdminFailureAlertEmail,
  logMailerError,
  type OrderItem,
  type OrderDetails,
} from "@/app/_lib/mailer";
import { prisma } from "@/app/_lib/prisma";
import { calculateDelivery } from "@/app/_lib/checkout-config";
import { zoneForCity } from "@/app/_lib/delivery-zones";
import { initialPaymentStatus } from "@/app/_lib/order-status";
import { nextWebNumber } from "@/app/_lib/web-number";
import { bookCourierAndNotify } from "./book-courier";

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
  email: z.string().trim().email("Valid email is required"),
  phone: LkPhoneSchema,
});

const ProcessOrderSchema = z.object({
  items: z.array(ItemInputSchema).min(1, "Cart is empty"),
  shippingAddress: AddressSchema,
  paymentMethod: z.enum(["COD", "PAYHERE", "KOKO", "MINTPAY"]),
  contactPhone: LkPhoneSchema,
  guestInfo: GuestInfoSchema.optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  notes: z.string().trim().max(500).optional(),
});

export type ProcessOrderInput = z.infer<typeof ProcessOrderSchema>;

/**
 * Internal helper to book courier and notify the brand/customer.
 * Handles both COD (Curfox booking) and Prepaid (deferred) flows.
 * Never throws — failures are logged and alerts sent to admin.
 * Returns the waybillNumber if booked.
 */
async function orchestrateCourierBooking(orderId: string, details: OrderDetails): Promise<string | undefined> {
  try {
    const royalEnabled = process.env.ROYAL_EXPRESS_ENABLED === "true";

    if (details.paymentMethod === "COD") {
      if (royalEnabled) {
        // Synchronous booking with non-blocking failure
        return await bookCourierAndNotify({ order: details });
      } else {
        console.log("[checkout] ROYAL_EXPRESS_ENABLED=false — skipping Curfox booking", {
          orderId,
        });
      }
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
  const { items, shippingAddress, paymentMethod, contactPhone, guestInfo, idempotencyKey, notes } =
    parsed.data;

  const session = await auth();

  let userId: string | null = null;
  let customerName: string;
  let customerEmail: string;
  let guestName: string | null = null;
  let guestEmail: string | null = null;

  if (session?.user?.id) {
    userId = session.user.id;
    const sessionName = session.user.name?.trim();
    if (!sessionName) {
      return {
        success: false,
        error: "Please add your name to your profile before checking out",
      };
    }
    customerName = sessionName;
    customerEmail = session.user.email ?? "";
  } else if (guestInfo) {
    customerName = guestInfo.name;
    customerEmail = guestInfo.email;
    guestName = guestInfo.name;
    guestEmail = guestInfo.email;
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
  const shippingCost = calculateDelivery(subtotal, zoneForCity(shippingAddress.city));
  const total = subtotal + shippingCost;
  const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  // Validate: products that offer size variants require a size selection.
  const productIds = Array.from(new Set(items.map((i) => i.productId)));
  const dbProducts = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, sizes: true },
  });
  const sizesByProduct = new Map(dbProducts.map((p) => [p.id, p.sizes]));

  for (const item of items) {
    const sizesCsv = sizesByProduct.get(item.productId);
    if (!sizesCsv) {
      return { success: false, error: `Unknown product "${item.name}"` };
    }
    const allowedSizes = sizesCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (allowedSizes.length > 0) {
      if (!item.size) {
        return { success: false, error: `Please select a size for "${item.name}"` };
      }
      if (!allowedSizes.includes(item.size)) {
        return {
          success: false,
          error: `Size "${item.size}" is not available for "${item.name}"`,
        };
      }
    }
  }

  // Create the order + decrement stock atomically. Stock decrement uses a
  // conditional update so concurrent purchases of the last unit can't oversell.
  let created: { webNumber: string | null; paymentStatus: string | null };
  try {
    created = await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const result = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (result.count === 0) {
          throw new Error(`Insufficient stock for "${item.name}"`);
        }
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
            create: items.map((item) => ({
              productId: item.productId,
              name: item.name,
              size: item.size ?? null,
              price: item.price,
              quantity: item.quantity,
            })),
          },
        },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create order";
    return { success: false, error: message };
  }

  // ── Branch on payment method (Option B2) ────────────────────────────
  const orderItems: OrderItem[] = items.map((item) => ({
    name: item.name,
    size: item.size ?? null,
    price: item.price,
    quantity: item.quantity,
  }));

  const orderDetailsForEmail: OrderDetails = {
    orderId,
    customerName,
    customerEmail,
    customerPhone: contactPhone,
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
      await sendOrderConfirmationEmail({
        ...orderDetailsForEmail,
        trackingCode,
      });
      await prisma.order.update({
        where: { id: orderId },
        data: { emailSent: true },
      });
    } catch (error) {
      logMailerError(
        "order-confirmation",
        { orderId, webNumber: created.webNumber },
        error,
      );
    }
  }

  return { success: true, orderId, webNumber: created.webNumber, trackingCode, isGuest: !userId };
}

