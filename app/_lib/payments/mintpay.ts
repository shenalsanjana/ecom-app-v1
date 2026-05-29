import { createHmac } from "crypto";
import { getMintpayConfig } from "./config";
import type { PaymentOrder, PaymentProvider } from "./types";

export function mintpaySuccessHash(merchantId: string, amount: number, orderId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${merchantId}${amount.toFixed(2)}${orderId}`)
    .digest("hex");
}

export function mintpayFailHash(orderId: string, secret: string): string {
  return createHmac("sha256", secret).update(orderId).digest("hex");
}

function customer(order: PaymentOrder) {
  const email = order.guestEmail ?? order.user?.email;
  if (!email) throw new Error("Order is missing customer email");
  return { email };
}

export const mintpayProvider: PaymentProvider = {
  method: "MINTPAY",
  displayName: "Mintpay",
  async initiate(order, baseUrl) {
    const cfg = getMintpayConfig();
    const buyer = customer(order);
    const successHash = Buffer.from(
      mintpaySuccessHash(cfg.merchantId, order.total, order.id, cfg.merchantSecret),
    ).toString("base64");
    const failHash = Buffer.from(mintpayFailHash(order.id, cfg.merchantSecret)).toString("base64");
    const successUrl = `${baseUrl}/api/payments/mintpay/return?orderId=${encodeURIComponent(order.id)}&amount=${encodeURIComponent(order.total.toFixed(2))}&hash=${encodeURIComponent(successHash)}&result=success`;
    const failUrl = `${baseUrl}/api/payments/mintpay/return?orderId=${encodeURIComponent(order.id)}&hash=${encodeURIComponent(failHash)}&result=failed`;
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

    const payload = {
      merchant_id: cfg.merchantId,
      order_id: order.id,
      total_price: order.total.toFixed(2),
      discount: "0",
      customer_email: buyer.email,
      customer_id: order.user?.email ?? order.guestEmail ?? "guest",
      delivery_street: `${order.shippingLine1}${order.shippingLine2 ? ", " + order.shippingLine2 : ""}`,
      customer_telephone: order.customerPhone,
      ip: "0.0.0.0",
      x_forwarded_for: "0.0.0.0",
      delivery_region: order.shippingCity,
      delivery_postcode: "",
      cart_created_date: now,
      cart_updated_date: now,
      products: order.items.map((item) => ({
        name: item.name,
        product_id: item.productId,
        sku: item.size ?? item.productId,
        quantity: String(item.quantity),
        unit_price: item.price.toFixed(2),
        discount: "0.00",
        created_date: now,
        updated_date: now,
      })),
      success_url: successUrl,
      fail_url: failUrl,
    };

    const response = await fetch(cfg.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Token ${cfg.merchantSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => String(response.status));
      throw new Error(`Mintpay order creation failed: ${response.status} ${detail.slice(0, 200)}`);
    }
    const body = (await response.json()) as { message?: string; data?: string };
    if (body.message !== "Success" || !body.data) {
      throw new Error(`Mintpay order creation failed: ${body.message ?? "no message"}`);
    }

    return {
      provider: "MINTPAY",
      displayName: "Mintpay",
      gatewayUrl: cfg.loginUrl,
      fields: { purchase_id: body.data },
    };
  },
};
