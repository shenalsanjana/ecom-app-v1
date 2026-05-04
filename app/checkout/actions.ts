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

const ROYAL_EXPRESS_API =
  process.env.ROYAL_EXPRESS_API ?? "https://royalexpress.merchant.curfox.com/add-new-order";

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
});

export type ProcessOrderInput = z.infer<typeof ProcessOrderSchema>;

export async function processOrder(input: ProcessOrderInput): Promise<CheckoutResult> {
  const parsed = ProcessOrderSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { success: false, error: first?.message ?? "Invalid order data" };
  }
  const { items, shippingAddress, paymentMethod, contactPhone, guestInfo, idempotencyKey } =
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

  // Submit to RoyalExpress (best-effort — failures here don't roll back the order).
  // Disabled by default until ROYAL_EXPRESS_API is configured to a working
  // endpoint and ROYAL_EXPRESS_ENABLED is explicitly set to "true".
  let trackingCode: string | undefined;
  const royalEnabled = process.env.ROYAL_EXPRESS_ENABLED === "true";
  const royalUser = process.env.ROYAL_EXPRESS_USER;
  const royalPass = process.env.ROYAL_EXPRESS_PASS;
  if (royalEnabled && royalUser && royalPass) {
    try {
      const royalResponse = await fetch(ROYAL_EXPRESS_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`${royalUser}:${royalPass}`).toString("base64")}`,
        },
        body: JSON.stringify({
          order_id: orderId,
          customer_name: customerName,
          customer_phone: contactPhone,
          customer_email: customerEmail,
          delivery_address: shippingAddress.line2
            ? `${shippingAddress.line1}, ${shippingAddress.line2}`
            : shippingAddress.line1,
          city: shippingAddress.city,
          province: shippingAddress.region,
          postal_code: shippingAddress.postalCode,
          country: shippingAddress.country,
          items: items.map((item) => ({ name: item.name, qty: item.quantity, price: item.price })),
          total_amount: total,
          payment_method: PAYMENT_METHOD_DISPLAY[paymentMethod],
          cod_amount: paymentMethod === "COD" ? total : 0,
        }),
      });

      if (royalResponse.ok) {
        const royalData = await royalResponse.json();
        trackingCode = royalData.tracking_code || royalData.id || royalData.order_id;
        await prisma.order.update({
          where: { id: orderId },
          data: { royalExpressSubmitted: true, trackingCode: trackingCode ?? null },
        });
      } else {
        console.error(
          "RoyalExpress API error:",
          royalResponse.status,
          await royalResponse.text(),
        );
      }
    } catch (error) {
      console.error("RoyalExpress submission failed:", error);
    }
  } else if (!royalEnabled) {
    // Intentionally silent — disabled via env flag until endpoint is verified.
  } else {
    console.warn("ROYAL_EXPRESS_USER / ROYAL_EXPRESS_PASS not set; skipping RoyalExpress submission");
  }

  // Send confirmation email to both customer and brand.
  const orderItems: OrderItem[] = items.map((item) => ({
    name: item.name,
    size: item.size ?? null,
    price: item.price,
    quantity: item.quantity,
  }));

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
