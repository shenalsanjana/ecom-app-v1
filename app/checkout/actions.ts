// app/checkout/actions.ts
"use server";

import { auth } from "@/app/_lib/auth";
import { sendOrderConfirmationEmail, type OrderItem } from "@/app/_lib/mailer";
import { hashSync } from "bcryptjs";
import { prisma } from "@/app/_lib/prisma";

const ROYAL_EXPRESS_API = "https://royalexpress.merchant.curfox.com/add-new-order";
const ROYAL_USERNAME = "stmart0001@gmail.com";
const ROYAL_PASSWORD = "-1996@Abc";
const SHIPPING_COST = 350;

export type PaymentMethod = "COD" | "PAYYHERE" | "KOKO" | "MINITPAY";

export type CheckoutResult =
  | { success: true; orderId: string; trackingCode?: string; isGuest?: boolean }
  | { success: false; error: string };

export async function processOrder(
  items: { productId: string; name: string; price: number; quantity: number }[],
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  },
  paymentMethod: PaymentMethod = "COD",
  guestInfo?: {
    name: string;
    email: string;
    phone?: string;
  }
): Promise<CheckoutResult> {
  const session = await auth();

  let customerName: string;
  let customerEmail: string;

  // Check if user is logged in or has guest info
  if (session?.user) {
    customerName = session.user.name ?? "Customer";
    customerEmail = session.user.email ?? "";
  } else if (guestInfo?.name && guestInfo?.email) {
    // Create guest account if needed
    const existingUser = await prisma.user.findUnique({
      where: { email: guestInfo.email },
    });

    if (!existingUser) {
      // Create temporary guest account
      const tempPassword = hashSync(Date.now().toString(), 10);
      await prisma.user.create({
        data: {
          name: guestInfo.name,
          email: guestInfo.email,
          passwordHash: tempPassword,
        },
      });
    }

    customerName = guestInfo.name;
    customerEmail = guestInfo.email;
  } else {
    return { success: false, error: "Please provide your name and email to continue" };
  }

  if (items.length === 0) {
    return { success: false, error: "Cart is empty" };
  }

  // Generate order ID
  const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = SHIPPING_COST;
  const total = subtotal + shipping;

  // Prepare order items
  const orderItems: OrderItem[] = items.map(item => ({
    name: item.name,
    price: item.price,
    quantity: item.quantity,
  }));

  // Get payment method display name
  const paymentMethodDisplay: Record<PaymentMethod, string> = {
    COD: "Cash on Delivery",
    PAYYHERE: "PayHere",
    KOKO: "Koko",
    MINITPAY: "MinitPay",
  };

  // COD amount: full total for COD, 0 for prepaid methods
  const codAmount = paymentMethod === "COD" ? total : 0;

  // Submit to RoyalExpress
  let trackingCode: string | undefined;
  try {
    const royalResponse = await fetch(ROYAL_EXPRESS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${ROYAL_USERNAME}:${ROYAL_PASSWORD}`).toString("base64")}`,
      },
      body: JSON.stringify({
        order_id: orderId,
        customer_name: customerName,
        customer_phone: guestInfo?.phone ?? "",
        customer_email: customerEmail,
        delivery_address: `${shippingAddress.line1}${shippingAddress.line2 ? ", " + shippingAddress.line2 : ""}`,
        city: shippingAddress.city,
        province: shippingAddress.region,
        postal_code: shippingAddress.postalCode,
        country: shippingAddress.country,
        items: items.map(item => ({
          name: item.name,
          qty: item.quantity,
          price: item.price,
        })),
        total_amount: total,
        payment_method: paymentMethodDisplay[paymentMethod],
        cod_amount: codAmount,
      }),
    });

    if (royalResponse.ok) {
      const royalData = await royalResponse.json();
      trackingCode = royalData.tracking_code || royalData.id || royalData.order_id;
    } else {
      console.error("RoyalExpress API error:", royalResponse.status, await royalResponse.text());
    }
  } catch (error) {
    console.error("RoyalExpress submission failed:", error);
    // Continue anyway - the order is still valid
  }

  // Send order email
  try {
    await sendOrderConfirmationEmail({
      orderId,
      customerName,
      customerEmail,
      items: orderItems,
      subtotal,
      shipping,
      total,
      shippingAddress,
      paymentMethod: paymentMethod as "COD",
      paymentMethodDisplay: paymentMethodDisplay[paymentMethod],
      trackingCode,
    });
  } catch (error) {
    console.error("Failed to send order email:", error);
    // Continue anyway - the order is still valid
  }

  return { success: true, orderId, trackingCode, isGuest: !session?.user };
}