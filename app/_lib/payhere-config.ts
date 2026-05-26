// app/_lib/payhere-config.ts
import { createHash } from "crypto";

/** PayHere base API URL (no trailing slash). */
export function payHereBaseUrl(): string {
  return process.env.PAYHERE_MODE === "live"
    ? "https://www.payhere.lk"
    : "https://sandbox.payhere.lk";
}

/** Merchant ID from PayHere dashboard → Settings > Domain Credentials. */
export function payHereMerchantId(): string {
  const id = process.env.PAYHERE_MERCHANT_ID;
  if (!id) {
    throw new Error("PAYHERE_MERCHANT_ID must be set in environment");
  }
  return id;
}

/** Merchant Secret — per domain/app, from PayHere dashboard → Settings > Domain Credentials. */
export function payHereMerchantSecret(): string {
  const secret = process.env.PAYHERE_MERCHANT_SECRET;
  if (!secret) {
    throw new Error("PAYHERE_MERCHANT_SECRET must be set in environment");
  }
  return secret;
}

/** PayHere Business App credentials — from PayHere dashboard → Settings > Business Apps. */
export function payHereAppCredentials(): { app_id: string; app_secret: string } {
  const app_id = process.env.PAYHERE_APP_ID;
  const app_secret = process.env.PAYHERE_APP_SECRET;
  if (!app_id || !app_secret) {
    throw new Error("PAYHERE_APP_ID and PAYHERE_APP_SECRET must be set in environment");
  }
  return { app_id, app_secret };
}

/** Generate the Basic auth code for PayHere OAuth: base64(app_id:app_secret). */
export function payHereAuthCode(): string {
  const { app_id, app_secret } = payHereAppCredentials();
  return Buffer.from(`${app_id}:${app_secret}`).toString("base64");
}

/**
 * Generate the PayHere Checkout hash.
 * Per PayHere docs:
 *   hash = upper(md5(merchant_id + order_id + amount_formatted + currency + upper(md5(merchant_secret))))
 * Amount must be formatted with 2 decimal places, no thousands separator (e.g. "1000.00").
 */
export function payHereCheckoutHash(
  merchantId: string,
  orderId: string,
  amount: number,
  currency: string,
): string {
  const merchantSecret = payHereMerchantSecret();
  const hashedSecret = createHash("md5").update(merchantSecret).digest("hex").toUpperCase();
  const amountFormatted = amount.toFixed(2);
  const str = `${merchantId}${orderId}${amountFormatted}${currency}${hashedSecret}`;
  return createHash("md5").update(str).digest("hex").toUpperCase();
}
