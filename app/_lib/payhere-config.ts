// app/_lib/payhere-config.ts
/** PayHere base API URL for creating a payment ticket. */
export function payHereApiUrl(): string {
  return process.env.PAYHERE_MODE === "live"
    ? "https://www.payhere.lk/paycheckout.ps?identifier=payment_ticket"
    : "https://sandbox.payhere.lk/paycheckout.ps?identifier=payment_ticket";
}

/** PayHere Payment Links base URL for redirect-based checkout. */
export function payHerePaymentLinkUrl(): string {
  return process.env.PAYHERE_MODE === "live"
    ? "https://www.payhere.lk/pay"
    : "https://sandbox.payhere.lk/pay";
}

/** Merchant ID from PayHere dashboard. */
export function payHereMerchantId(): string {
  const id = process.env.PAYHERE_MERCHANT_ID;
  if (!id) {
    throw new Error("PAYHERE_MERCHANT_ID must be set in environment");
  }
  return id;
}

/** PayHere app credentials — server-side only. */
export function payHereCredentials(): { app_id: string; app_secret: string } {
  const app_id = process.env.PAYHERE_APP_ID;
  const app_secret = process.env.PAYHERE_APP_SECRET;
  if (!app_id || !app_secret) {
    throw new Error("PAYHERE_APP_ID and PAYHERE_APP_SECRET must be set in environment");
  }
  return { app_id, app_secret };
}