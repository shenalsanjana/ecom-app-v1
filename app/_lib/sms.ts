const NOTIFY_ENDPOINT = "https://app.notify.lk/api/v1/send";
const CONTACT_NUMBER = process.env.CONTACT_NUMBER ?? "+94 740545536";

type SmsSender = (to: string, message: string) => Promise<void>;
let testSender: SmsSender | null = null;

/** Test seam — inject a capturing sender so unit tests never hit the network. */
export function __setTestSmsSender(fn: SmsSender | null): void {
  testSender = fn;
}

async function sendSms(phone: string, message: string): Promise<void> {
  const to = phone.replace(/^\+/, ""); // Notify.lk wants 94XXXXXXXXX
  if (testSender) return testSender(to, message);

  const { NOTIFY_LK_USER_ID, NOTIFY_LK_API_KEY, NOTIFY_LK_SENDER_ID } = process.env;
  if (!NOTIFY_LK_USER_ID || !NOTIFY_LK_API_KEY || !NOTIFY_LK_SENDER_ID) {
    throw new Error(
      "Notify.lk is not configured. Set NOTIFY_LK_USER_ID, NOTIFY_LK_API_KEY, NOTIFY_LK_SENDER_ID.",
    );
  }
  const body = new URLSearchParams({
    user_id: NOTIFY_LK_USER_ID,
    api_key: NOTIFY_LK_API_KEY,
    sender_id: NOTIFY_LK_SENDER_ID,
    to,
    message,
  });
  const res = await fetch(NOTIFY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as { status?: string };
  if (!res.ok || json.status !== "success") {
    throw new Error(`Notify.lk send failed: ${res.status} ${JSON.stringify(json)}`);
  }
}

export function sendOtpSms(phone: string, code: string, _purpose: "SIGNUP" | "RESET"): Promise<void> {
  return sendSms(phone, `Your Dressing Bear code is ${code}. Valid 10 minutes. Do not share it.`);
}

export function sendAccountExistsSms(phone: string): Promise<void> {
  return sendSms(
    phone,
    `You already have a Dressing Bear account. Please log in, or use "Forgot password" to reset it.`,
  );
}

export function sendOrderConfirmationSms(p: { phone: string; ref: string; total: number }): Promise<void> {
  return sendSms(
    p.phone,
    `Dressing Bear: order ${p.ref} confirmed. Total Rs ${Math.round(p.total)}. We'll text you when it ships.`,
  );
}

export function sendOrderDispatchedSms(p: {
  phone: string;
  ref: string;
  trackingCode: string;
  carrier: string;
}): Promise<void> {
  return sendSms(
    p.phone,
    `Dressing Bear: order ${p.ref} shipped via ${p.carrier}. Track: ${p.trackingCode}.`,
  );
}

export function sendOrderCancelledSms(p: { phone: string; ref: string }): Promise<void> {
  return sendSms(
    p.phone,
    `Dressing Bear: order ${p.ref} has been cancelled. Questions? Call ${CONTACT_NUMBER}.`,
  );
}
