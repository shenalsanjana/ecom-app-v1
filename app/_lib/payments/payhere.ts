import { payHereCheckoutHash, payHereCheckoutUrl, payHereMerchantId } from "@/app/_lib/payhere-config";
import type { PaymentProvider } from "./types";
import { requireNameAndEmail } from "./shared";

function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: parts[0] };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

export const payHereProvider: PaymentProvider = {
  method: "PAYHERE",
  displayName: "PayHere",
  async initiate(order, baseUrl) {
    const merchantId = payHereMerchantId();
    const amount = Number(order.total.toFixed(2));
    const buyer = requireNameAndEmail(order);
    const { first_name, last_name } = splitName(buyer.name);
    const items =
      order.items.length > 0
        ? order.items.map((it) => `${it.name} x${it.quantity}`).join(", ")
        : "Dressing Bear Order";

    return {
      provider: "PAYHERE",
      displayName: "PayHere",
      gatewayUrl: payHereCheckoutUrl(),
      fields: {
        merchant_id: merchantId,
        return_url: `${baseUrl}/checkout/success`,
        cancel_url: `${baseUrl}/checkout/success?status=cancelled`,
        notify_url: `${baseUrl}/api/payhere/webhook`,
        first_name,
        last_name,
        email: buyer.email,
        phone: order.customerPhone,
        address: `${order.shippingLine1}${order.shippingLine2 ? ", " + order.shippingLine2 : ""}`,
        city: order.shippingCity,
        country: order.shippingCountry,
        order_id: order.id,
        items,
        currency: "LKR",
        amount: amount.toFixed(2),
        hash: payHereCheckoutHash(merchantId, order.id, amount, "LKR"),
      },
    };
  },
};
