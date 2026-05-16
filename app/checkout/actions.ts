// app/checkout/actions.ts
"use server";

import { z } from "zod";
import { LkPhoneSchema } from "@/app/_lib/validation";
import { auth } from "@/app/_lib/auth";
import { sendOrderConfirmationEmail, type OrderItem } from "@/app/_lib/mailer";
import { prisma } from "@/app/_lib/prisma";
import { calculateShipping } from "@/app/_lib/checkout-config";

export type PaymentMethod = "COD" | "PAYHERE" | "KOKO" | "MINITPAY";

export type CheckoutResult =
  | { success: true; orderId: string; trackingCode?: string; isGuest?: boolean }
  | { success: false; error: string };

const PAYMENT_METHOD_DISPLAY: Record<PaymentMethod, string> = {
  COD: "Cash on Delivery",
  PAYHERE: "PayHere",
  KOKO: "Koko",
  MINITPAY: "MinitPay",
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
  region: z.string().trim().min(1, "Province is required"),
  postalCode: z.string().trim().min(1, "Postal code is required"),
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
  paymentMethod: z.enum(["COD", "PAYHERE", "KOKO", "MINITPAY"]),
  contactPhone: LkPhoneSchema,
  guestInfo: GuestInfoSchema.optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  notes: z.string().trim().max(500).optional(),
});

export type ProcessOrderInput = z.infer<typeof ProcessOrderSchema>;

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
    customerName = session.user.name ?? "Customer";
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
        trackingCode: existing.trackingCode ?? undefined,
        isGuest: !existing.userId,
      };
    }
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingCost = calculateShipping(subtotal);
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
  try {
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const result = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (result.count === 0) {
          throw new Error(`Insufficient stock for "${item.name}"`);
        }
      }

      await tx.order.create({
        data: {
          id: orderId,
          userId,
          guestName,
          guestEmail,
          customerPhone: contactPhone,
          shippingLine1: shippingAddress.line1,
          shippingLine2: shippingAddress.line2 ?? null,
          shippingCity: shippingAddress.city,
          shippingRegion: shippingAddress.region,
          shippingPostalCode: shippingAddress.postalCode,
          shippingCountry: shippingAddress.country,
          subtotal,
          shippingCost,
          total,
          paymentMethod,
          paymentMethodDisplay: PAYMENT_METHOD_DISPLAY[paymentMethod],
          status: "PENDING",
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
  const royalEnabled = process.env.ROYAL_EXPRESS_ENABLED === "true";

  const orderItems: OrderItem[] = items.map((item) => ({
    name: item.name,
    size: item.size ?? null,
    price: item.price,
    quantity: item.quantity,
  }));

  const orderDetailsForEmail: import("@/app/_lib/mailer").OrderDetails = {
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
  };

  if (paymentMethod === "COD") {
    if (royalEnabled) {
      try {
        const { bookCourierAndNotify } = await import("./book-courier");
        await bookCourierAndNotify({ order: orderDetailsForEmail });
      } catch (err) {
        console.error("[checkout] bookCourierAndNotify threw (contract violated):", err);
      }
    } else {
      console.log(
        "[checkout] ROYAL_EXPRESS_ENABLED=false — skipping Curfox booking",
        { orderId },
      );
    }
  } else {
    console.log(
      "[checkout] Skipped courier automation: awaiting payment confirmation",
      { orderId, paymentMethod },
    );
    try {
      const { sendPendingPrepaidNotificationEmail } = await import("@/app/_lib/mailer");
      await sendPendingPrepaidNotificationEmail({ order: orderDetailsForEmail });
    } catch (err) {
      console.error("[mailer] pending-prepaid send failed:", err);
    }
    // TODO(curfox-hook): when PayHere/Koko/MinitPay webhook handlers are added,
    // they should call bookCourierAndNotify({ order: <reconstructed OrderDetails> })
    // here on payment success.
  }

  // Reload waybill if COD booking persisted it
  let trackingCode: string | undefined;
  if (paymentMethod === "COD") {
    const updated = await prisma.order.findUnique({
      where: { id: orderId },
      select: { courierWaybillNumber: true },
    });
    trackingCode = updated?.courierWaybillNumber ?? undefined;
  }

  // Send confirmation email to both customer and brand.
  try {
    await sendOrderConfirmationEmail({
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
      trackingCode,
      notes: notes && notes.length > 0 ? notes : undefined,
    });
    await prisma.order.update({
      where: { id: orderId },
      data: { emailSent: true },
    });
  } catch (error) {
    console.error("Failed to send order email:", error);
  }

  return { success: true, orderId, trackingCode, isGuest: !userId };
}
