// app/_lib/payhere-config.ts
/** PayHere base API URL for creating a payment ticket. */
export function payHereApiUrl(): string {
  return process.env.PAYHERE_MODE === "live"
    ? "https://www.payhere.lk/paycheckout.ps?identifier=payment_ticket"
    : "https://sandbox.payhere.lk/paycheckout.ps?identifier=payment_ticket";
}

/** Base URL for PayHere Checkout JS CDN script. */
export function payHereCheckoutScriptUrl(): string {
  return process.env.PAYHERE_MODE === "live"
    ? "https://www.payhere.lk/paycheckout.js"
    : "https://sandbox.payhere.lk/paycheckout.js";
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