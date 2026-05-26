// app/_lib/payhere-api.ts
import { payHereBaseUrl, payHereAuthCode, payHereMerchantId, payHereAppCredentials } from "./payhere-config";

// ── Types ────────────────────────────────────────────────────────────────────

interface PayHereTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface PaymentLinkRequest {
  order_id: string;
  items: string;
  amount: number;
  currency: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;
  hash: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_country?: string;
  platform?: string;
  custom_1?: string;
  custom_2?: string;
}

interface PaymentLinkResponse {
  status: number;
  msg: string;
  data?: {
    payment_id?: string;
    customer_id?: string;
    payment_url?: string;
    [key: string]: unknown;
  };
}

interface PaymentSearchResponse {
  status: number;
  msg: string;
  data?: {
    payment_id?: string;
    order_id?: string;
    amount?: number;
    currency?: string;
    status?: number;
    method?: string;
    [key: string]: unknown;
  }[];
}

// ── Token management ─────────────────────────────────────────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5-minute buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 300_000) {
    console.log("[payhere-api] Using cached access token");
    return cachedToken.value;
  }

  const baseUrl = payHereBaseUrl();
  const { app_id } = payHereAppCredentials();
  console.log("[payhere-api] Requesting new OAuth access token", {
    endpoint: `${baseUrl}/merchant/v1/oauth/token`,
    app_id,
    auth_code_prefix: payHereAuthCode().substring(0, 10) + "...",
  });

  const res = await fetch(`${baseUrl}/merchant/v1/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${payHereAuthCode()}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "<unreadable>");
    console.error("[payhere-api] OAuth token request failed", {
      status: res.status,
      statusText: res.statusText,
      body: errText,
    });
    throw new Error(`PayHere OAuth failed: ${res.status} ${res.statusText}`);
  }

  const data: PayHereTokenResponse = await res.json();
  console.log("[payhere-api] OAuth access token obtained", {
    token_type: data.token_type,
    expires_in: data.expires_in,
    token_prefix: data.access_token?.substring(0, 10) + "...",
  });

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.value;
}

// ── Payment Link Creation ────────────────────────────────────────────────────

export interface CreatePaymentLinkInput {
  orderId: string;
  amount: number;
  currency: string;
  items: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  hash: string;
}

export interface CreatePaymentLinkResult {
  success: boolean;
  paymentUrl?: string;
  paymentId?: string;
  error?: string;
}

export async function createPaymentLink(
  input: CreatePaymentLinkInput,
): Promise<CreatePaymentLinkResult> {
  const baseUrl = payHereBaseUrl();
  const merchantId = payHereMerchantId();

  console.log("[payhere-api] Creating payment link", {
    merchant_id: merchantId,
    order_id: input.orderId,
    amount: input.amount,
    currency: input.currency,
    items: input.items,
    customer_name: `${input.firstName} ${input.lastName}`,
    email: input.email,
    phone: input.phone,
    return_url: input.returnUrl,
    cancel_url: input.cancelUrl,
    notify_url: input.notifyUrl,
  });

  const accessToken = await getAccessToken();

  const body: PaymentLinkRequest = {
    order_id: input.orderId,
    items: input.items,
    amount: input.amount,
    currency: input.currency,
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    phone: input.phone,
    address: input.address,
    city: input.city,
    country: input.country,
    return_url: input.returnUrl,
    cancel_url: input.cancelUrl,
    notify_url: input.notifyUrl,
    hash: input.hash,
  };

  console.log("[payhere-api] Sending payment link creation request", {
    endpoint: `${baseUrl}/merchant/v1/payment/link`,
    body,
  });

  const res = await fetch(`${baseUrl}/merchant/v1/payment/link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "<unreadable>");
    console.error("[payhere-api] Payment link creation request failed", {
      status: res.status,
      statusText: res.statusText,
      body: errText,
    });
    return {
      success: false,
      error: `PayHere API error: ${res.status} ${res.statusText} — ${errText}`,
    };
  }

  const data: PaymentLinkResponse = await res.json();
  console.log("[payhere-api] Payment link creation response", {
    status: data.status,
    msg: data.msg,
    payment_id: data.data?.payment_id,
    payment_url: data.data?.payment_url,
  });

  if (data.status < 0 || !data.data?.payment_url) {
    return {
      success: false,
      error: `PayHere payment link creation failed: ${data.msg}`,
    };
  }

  return {
    success: true,
    paymentUrl: data.data.payment_url,
    paymentId: data.data.payment_id,
  };
}

// ── Payment Verification ─────────────────────────────────────────────────────

export interface PaymentVerificationResult {
  verified: boolean;
  status?: number;
  statusText?: string;
  paymentId?: string;
  amount?: number;
  method?: string;
  error?: string;
}

/** Verify a payment by querying the PayHere Merchant API. */
export async function verifyPayment(orderId: string): Promise<PaymentVerificationResult> {
  const baseUrl = payHereBaseUrl();
  const merchantId = payHereMerchantId();

  console.log("[payhere-api] Verifying payment", {
    merchant_id: merchantId,
    order_id: orderId,
    endpoint: `${baseUrl}/merchant/v1/payment/search?order_id=${orderId}`,
  });

  const accessToken = await getAccessToken();

  const res = await fetch(
    `${baseUrl}/merchant/v1/payment/search?order_id=${encodeURIComponent(orderId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "<unreadable>");
    console.error("[payhere-api] Payment verification request failed", {
      status: res.status,
      statusText: res.statusText,
      body: errText,
    });
    return {
      verified: false,
      error: `PayHere API error: ${res.status} ${res.statusText}`,
    };
  }

  const data: PaymentSearchResponse = await res.json();
  console.log("[payhere-api] Payment verification response", {
    status: data.status,
    msg: data.msg,
    payments_count: data.data?.length ?? 0,
  });

  if (data.status < 0 || !data.data || data.data.length === 0) {
    return {
      verified: false,
      status: data.status,
      statusText: data.msg,
      error: `No payment found: ${data.msg}`,
    };
  }

  // Find the most relevant payment (latest successful one, or latest overall)
  const payments = data.data;
  const successfulPayment = payments.find((p) => p.status === 2) ?? payments[0];

  console.log("[payhere-api] Payment found", {
    payment_id: successfulPayment.payment_id,
    order_id: successfulPayment.order_id,
    amount: successfulPayment.amount,
    status: successfulPayment.status,
    method: successfulPayment.method,
  });

  // PayHere status codes: 2=success, 0=pending, -1=canceled, -2=failed, -3=chargedback
  if (successfulPayment.status === 2) {
    return {
      verified: true,
      status: successfulPayment.status,
      statusText: "success",
      paymentId: successfulPayment.payment_id,
      amount: successfulPayment.amount,
      method: successfulPayment.method,
    };
  }

  return {
    verified: false,
    status: successfulPayment.status,
    statusText: getPayHereStatusText(successfulPayment.status),
    paymentId: successfulPayment.payment_id,
  };
}

function getPayHereStatusText(code: number | undefined): string {
  switch (code) {
    case 2:
      return "success";
    case 0:
      return "pending";
    case -1:
      return "canceled";
    case -2:
      return "failed";
    case -3:
      return "chargedback";
    default:
      return `unknown (${code})`;
  }
}
