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

export type SmsOrderItem = { name: string; color?: string | null };
const CONFIRMATION_SMS_LIMIT = 160;

function cleanPart(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function shorten(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 1) return value.slice(0, Math.max(0, maxLength));
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Minimum budget that can hold a balanced "X (Y)" structure: 1 name char + " (" + 1 color char + ")". */
const MIN_COLOR_STRUCTURE_LENGTH = 5;

function formatSmsItem(item: SmsOrderItem, maxLength: number): string {
  const name = cleanPart(item.name);
  const color = cleanPart(item.color);
  if (maxLength <= 0) return "";
  if (!color || maxLength < MIN_COLOR_STRUCTURE_LENGTH) return shorten(name, maxLength);
  const fullLength = name.length + color.length + 3; // "name (color)"
  if (fullLength <= maxLength) return `${name} (${color})`;
  const colorBudget = maxLength - 4; // reserve exactly 1 name char + " (" + ")"
  if (color.length <= colorBudget) {
    return `${shorten(name, maxLength - color.length - 3)} (${color})`;
  }
  return `${shorten(name, 1)} (${shorten(color, colorBudget)})`;
}

/**
 * Distributes `available` characters across items in priority order: every item first gets 1
 * char (so it appears at all), then colored items grow toward "1-char name + full color" before
 * any item's name grows further. This keeps colors intact ahead of colorless product-name
 * expansion, and never assigns more than `available` total so callers stay within their budget.
 */
function allocateSmsItemBudgets(items: SmsOrderItem[], available: number): number[] {
  const n = items.length;
  const budgets = items.map(() => 0);
  if (n === 0 || available <= 0) return budgets;

  const colors = items.map((item) => cleanPart(item.color));
  const names = items.map((item) => cleanPart(item.name));

  let remaining = available;
  for (let index = 0; index < n && remaining > 0; index += 1) {
    budgets[index] = 1;
    remaining -= 1;
  }

  let progress = true;
  while (remaining > 0 && progress) {
    progress = false;
    for (let index = 0; index < n && remaining > 0; index += 1) {
      if (!colors[index]) continue;
      const minNeed = colors[index].length + 4;
      if (budgets[index] < minNeed) {
        budgets[index] += 1;
        remaining -= 1;
        progress = true;
      }
    }
  }

  progress = true;
  while (remaining > 0 && progress) {
    progress = false;
    for (let index = 0; index < n && remaining > 0; index += 1) {
      const maxNeed = colors[index] ? names[index].length + colors[index].length + 3 : names[index].length;
      if (budgets[index] < maxNeed) {
        budgets[index] += 1;
        remaining -= 1;
        progress = true;
      }
    }
  }
  return budgets;
}

export function buildConfirmationItemSummary(items: SmsOrderItem[] | undefined, maxLength: number): string {
  const visible = (items ?? []).slice(0, 2);
  if (visible.length === 0 || maxLength <= 0) return "";
  const omitted = Math.max(0, (items?.length ?? 0) - visible.length);
  const moreText = omitted > 0 ? ` +${omitted} more` : "";
  const separatorLength = visible.length > 1 ? 2 : 0;

  let effectiveMoreText = moreText;
  let availableForItems = maxLength - effectiveMoreText.length - separatorLength;
  if (effectiveMoreText && availableForItems < visible.length) {
    effectiveMoreText = "";
    availableForItems = maxLength - separatorLength;
  }
  availableForItems = Math.max(0, availableForItems);

  const budgets = allocateSmsItemBudgets(visible, availableForItems);
  const formatted = visible.map((item, index) => formatSmsItem(item, budgets[index])).filter(Boolean);
  return `${formatted.join(", ")}${effectiveMoreText}`;
}

export function sendOrderConfirmationSms(p: { phone: string; ref: string; total: number; items?: SmsOrderItem[] }): Promise<void> {
  const prefix = `Dressing Bear: order ${p.ref} confirmed.`;
  const suffix = `Total Rs ${Math.round(p.total)}. We'll text you when it ships.`;
  const fixed = `${prefix} ${suffix}`;
  const summary = buildConfirmationItemSummary(p.items, Math.max(0, CONFIRMATION_SMS_LIMIT - fixed.length - 2));
  const message = summary ? `${prefix} ${summary}. ${suffix}` : fixed;
  return sendSms(p.phone, shorten(message, CONFIRMATION_SMS_LIMIT));
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
