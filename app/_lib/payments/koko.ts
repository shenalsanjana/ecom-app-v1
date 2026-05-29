import { createPrivateKey, sign } from "crypto";
import { getKokoConfig } from "./config";
import type { PaymentOrder, PaymentProvider } from "./types";

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function customer(order: PaymentOrder) {
  const name = order.guestName ?? order.user?.name;
  const email = order.guestEmail ?? order.user?.email;
  if (!name || !email) throw new Error("Order is missing customer name or email");
  return { name, email };
}

export function signKokoDataString(dataString: string, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  return sign("RSA-SHA256", Buffer.from(dataString), key).toString("base64");
}

export const kokoProvider: PaymentProvider = {
  method: "KOKO",
  displayName: "Koko",
  async initiate(order, baseUrl) {
    const cfg = getKokoConfig();
    const buyer = customer(order);
    const { firstName, lastName } = splitName(buyer.name);
    const amount = order.total.toFixed(2);
    const description =
      order.items.length > 0
        ? order.items.map((it) => `${it.name} x${it.quantity}`).join(", ")
        : "Dressing Bear Order";
    const reference = order.webNumber ?? order.id;
    const returnUrl = `${baseUrl}/api/payments/koko/return?order_id=${encodeURIComponent(order.id)}`;
    const cancelUrl = `${baseUrl}/api/payments/koko/return?order_id=${encodeURIComponent(order.id)}&status=cancelled`;
    const responseUrl = `${baseUrl}/api/payments/koko/response`;
    const dataString =
      cfg.merchantId +
      amount +
      "LKR" +
      cfg.pluginName +
      cfg.pluginVersion +
      returnUrl +
      cancelUrl +
      order.id +
      reference +
      firstName +
      lastName +
      buyer.email +
      description +
      cfg.apiKey +
      responseUrl;

    return {
      provider: "KOKO",
      displayName: "Koko",
      gatewayUrl: cfg.orderCreateUrl,
      fields: {
        _mId: cfg.merchantId,
        api_key: cfg.apiKey,
        _returnUrl: returnUrl,
        _responseUrl: responseUrl,
        _currency: "LKR",
        _amount: amount,
        _reference: reference,
        _pluginName: cfg.pluginName,
        _pluginVersion: cfg.pluginVersion,
        _cancelUrl: cancelUrl,
        _orderId: order.id,
        _firstName: firstName,
        _lastName: lastName,
        _email: buyer.email,
        _description: description,
        dataString,
        signature: signKokoDataString(dataString, cfg.privateKey),
        _mobileNo: order.customerPhone,
      },
    };
  },
};
