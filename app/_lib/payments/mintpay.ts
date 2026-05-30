import { createHash, createHmac } from "crypto";
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

// Mintpay's `customer_id` is validated as max_length=10 but then cast to a 32-bit
// integer server-side: a non-numeric value (e.g. a hex hash) throws server-side and
// returns a 500, and a numeric value > 2^31-1 overflows and also 500s (both verified
// against the Mintpay sandbox). We have no short numeric customer key on PaymentOrder,
// so derive a stable 9-digit number from the email: sha256 -> first 32 bits -> mod 1e9
// yields 0..999,999,999, always within signed-32-bit range. customer_id is not a
// reconciliation key (only order_id is matched on the return URL), so a derived value
// is safe; deterministic-from-email keeps the same buyer consistent across orders.
function shortCustomerId(email: string): string {
  const hex = createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 8);
  return String(parseInt(hex, 16) % 1_000_000_000);
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
      customer_id: shortCustomerId(buyer.email),
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
