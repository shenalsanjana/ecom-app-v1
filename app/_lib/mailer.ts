// app/_lib/mailer.ts
import nodemailer from "nodemailer";
import { formatPrice } from "@/app/_lib/format";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let cached: nodemailer.Transporter | null = null;
let testTransport: nodemailer.Transporter | null = null;

export function __setTestTransport(t: nodemailer.Transporter | null): void {
  testTransport = t;
  cached = null;
}

function getTransport(): nodemailer.Transporter {
  if (testTransport) return testTransport;
  if (cached) return cached;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env.local.",
    );
  }
  cached = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? Number(SMTP_PORT) : 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return cached;
}

const BRAND_NAME = process.env.BRAND_NAME ?? "Dressing Bear";
const CONTACT_NUMBER = process.env.CONTACT_NUMBER ?? "+94 740545536";

function requireFrom(): string {
  const from = process.env.SMTP_FROM;
  if (!from) {
    throw new Error(
      "SMTP_FROM is not configured. Set SMTP_FROM in .env.local (e.g. \"Dressing Bear <no-reply@dressingbear.com>\").",
    );
  }
  return from;
}

function requireBrandEmail(): string {
  const email = process.env.BRAND_EMAIL;
  if (!email) {
    throw new Error(
      "BRAND_EMAIL is not configured. Set BRAND_EMAIL in .env.local.",
    );
  }
  return email;
}

// Replies go to the brand inbox even when the From: address is a relay-aligned
// technical address (needed to pass DMARC on strict providers like Gmail).
function brandReplyTo(): string | undefined {
  return process.env.BRAND_EMAIL ?? undefined;
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const transport = getTransport();
  const from = requireFrom();
  await transport.sendMail({
    from,
    to,
    replyTo: brandReplyTo(),
    subject: `Reset your ${BRAND_NAME} password`,
    text: `We received a request to reset your password.\n\nClick the link below to set a new password (valid for 30 minutes):\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
    html: `<p>We received a request to reset your password.</p>
<p><a href="${resetUrl}">Click here to set a new password</a> (valid for 30 minutes).</p>
<p>If you didn't request this, you can ignore this email.</p>`,
  });
}

export type OrderItem = {
  name: string;
  size?: string | null;
  price: number;
  quantity: number;
};

export type OrderDetails = {
  orderId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  };
  paymentMethod: "COD" | "PAYHERE" | "KOKO" | "MINITPAY";
  paymentMethodDisplay?: string;
  trackingCode?: string;
  notes?: string;
};

export async function sendOrderConfirmationEmail(order: OrderDetails): Promise<void> {
  const transport = getTransport();
  const brandEmail = requireBrandEmail();
  const from = requireFrom();
  const paymentDisplay = order.paymentMethodDisplay ?? "Cash on Delivery";

  const itemsListText = order.items
    .map((item) => {
      const sizeStr = item.size ? ` (Size ${item.size})` : "";
      return `${item.name}${sizeStr} x${item.quantity} - ${formatPrice(item.price * item.quantity)}`;
    })
    .join("\n");

  const itemsListHtml = order.items
    .map(
      (item) => {
        const sizeStr = item.size ? ` <span style="color:#666;font-size:0.9em;">(Size ${escapeHtml(item.size)})</span>` : "";
        return `
        <div class="item">
          <span>${escapeHtml(item.name)}${sizeStr} × ${item.quantity}</span>
          <span>${formatPrice(item.price * item.quantity)}</span>
        </div>`;
      },
    )
    .join("");

  const text = `
Order Confirmation - ${BRAND_NAME}

Order ID: ${order.orderId}
Customer: ${order.customerName}
Email: ${order.customerEmail}${order.customerPhone ? `\nPhone: ${order.customerPhone}` : ""}
Payment Method: ${paymentDisplay}${order.trackingCode ? `\nTracking Code: ${order.trackingCode}` : ""}

Items:
${itemsListText}

Subtotal: ${formatPrice(order.subtotal)}
Shipping: ${order.shipping === 0 ? "Free" : formatPrice(order.shipping)}
Total: ${formatPrice(order.total)}

Shipping Address:
${order.shippingAddress.line1}
${order.shippingAddress.line2 ? order.shippingAddress.line2 + "\n" : ""}${order.shippingAddress.city}, ${order.shippingAddress.region} ${order.shippingAddress.postalCode}
${order.shippingAddress.country}
${order.notes && order.notes.trim() ? `\nDelivery Notes:\n${order.notes}\n` : ""}
Need help? Contact us at ${CONTACT_NUMBER} or ${brandEmail}.

---
${BRAND_NAME}
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .items { border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin: 15px 0; }
    .item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
    .item:last-child { border-bottom: none; }
    .total { font-size: 1.2em; font-weight: bold; margin-top: 15px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; color: #2c3e50;">${escapeHtml(BRAND_NAME)}</h1>
      <h2 style="margin: 10px 0 0 0; color: #27ae60;">Order Confirmation</h2>
    </div>

    <p>Hi ${escapeHtml(order.customerName)}, thank you for your order. Here are the details:</p>

    <p><strong>Order ID:</strong> ${escapeHtml(order.orderId)}</p>
    <p><strong>Email:</strong> ${escapeHtml(order.customerEmail)}</p>
    ${order.customerPhone ? `<p><strong>Phone:</strong> ${escapeHtml(order.customerPhone)}</p>` : ""}
    <p><strong>Payment Method:</strong> ${escapeHtml(paymentDisplay)}</p>
    ${order.trackingCode ? `<p><strong>Tracking Code:</strong> ${escapeHtml(order.trackingCode)}</p>` : ""}

    <div class="items">
      <h3 style="margin-top: 0;">Items</h3>
      ${itemsListHtml}
    </div>

    <p><strong>Subtotal:</strong> ${formatPrice(order.subtotal)}</p>
    <p><strong>Shipping:</strong> ${order.shipping === 0 ? "Free" : formatPrice(order.shipping)}</p>
    <p class="total"><strong>Total:</strong> ${formatPrice(order.total)}</p>

    <div class="footer">
      <h3>Shipping Address</h3>
      <p>
        ${escapeHtml(order.shippingAddress.line1)}<br>
        ${order.shippingAddress.line2 ? escapeHtml(order.shippingAddress.line2) + "<br>" : ""}
        ${escapeHtml(order.shippingAddress.city)}, ${escapeHtml(order.shippingAddress.region)} ${escapeHtml(order.shippingAddress.postalCode)}<br>
        ${escapeHtml(order.shippingAddress.country)}
      </p>
      ${order.notes && order.notes.trim() ? `<h3>Delivery Notes</h3><p>${escapeHtml(order.notes).replace(/\n/g, "<br>")}</p>` : ""}
      <p>Need help? Contact us at <strong>${escapeHtml(CONTACT_NUMBER)}</strong> or <a href="mailto:${encodeURIComponent(brandEmail)}">${escapeHtml(brandEmail)}</a>.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  // Send to customer (with brand on BCC) so the customer gets their copy and
  // the brand keeps a record. nodemailer accepts both.
  await transport.sendMail({
    from,
    to: order.customerEmail,
    bcc: brandEmail,
    replyTo: brandReplyTo(),
    subject: `Order ${order.orderId} - ${BRAND_NAME}`,
    text,
    html,
  });
}

export type ContactSubmission = {
  name?: string;
  email: string;
  phone?: string;
  message: string;
};

export async function sendContactEmail(submission: ContactSubmission): Promise<void> {
  const transport = getTransport();
  const brandEmail = requireBrandEmail();
  const from = requireFrom();

  const { name, email, phone, message } = submission;

  const text = `
New Contact Form Submission

Name: ${name || "Not provided"}
Email: ${email}
Phone: ${phone || "Not provided"}

Message:
${message}

---
Submitted from ${BRAND_NAME} website
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .field { margin-bottom: 15px; }
    .label { font-weight: bold; color: #555; }
    .message-box { background: #f9f9f9; padding: 15px; border-radius: 8px; border-left: 4px solid #007bff; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; color: #2c3e50;">${escapeHtml(BRAND_NAME)}</h1>
      <h2 style="margin: 10px 0 0 0; color: #007bff;">New Contact Form Submission</h2>
    </div>

    <div class="field">
      <div class="label">Name:</div>
      <div>${name ? escapeHtml(name) : "Not provided"}</div>
    </div>

    <div class="field">
      <div class="label">Email:</div>
      <div><a href="mailto:${encodeURIComponent(email)}">${escapeHtml(email)}</a></div>
    </div>

    <div class="field">
      <div class="label">Phone:</div>
      <div>${phone ? escapeHtml(phone) : "Not provided"}</div>
    </div>

    <div class="field">
      <div class="label">Message:</div>
      <div class="message-box">${escapeHtml(message).replace(/\n/g, "<br>")}</div>
    </div>
  </div>
</body>
</html>
  `.trim();

  await transport.sendMail({
    from,
    to: brandEmail,
    replyTo: email,
    subject: `New Contact: ${name || "Anonymous"} - ${email}`,
    text,
    html,
  });
}

// ── Dispatch / admin emails ─────────────────────────────────────────────

function formatItemsList(items: OrderItem[]): string {
  return items
    .map((it) => `  • ${it.name}${it.size ? ` (${it.size})` : ""} × ${it.quantity}`)
    .join("\n");
}

function formatAddress(addr: OrderDetails["shippingAddress"]): string {
  const lines = [
    addr.line1,
    addr.line2,
    `${addr.city}, ${addr.region} ${addr.postalCode}`,
    addr.country,
  ].filter(Boolean);
  return lines.join("\n  ");
}

export async function sendDispatchNotificationEmail(params: {
  order: OrderDetails;
  waybillNumber: string;
  pdfBuffer?: Buffer;
}): Promise<void> {
  const { order, waybillNumber, pdfBuffer } = params;
  const transport = getTransport();
  const brandEmail = requireBrandEmail();
  const from = requireFrom();

  const pdfNote = pdfBuffer
    ? "The printable airwaybill is attached as delivery-note.pdf."
    : "⚠ The PDF could not be fetched from Curfox — download it from the merchant portal at https://royalexpress.merchant.curfox.com/";

  const text = `A new COD order has been booked with Royal Express via Curfox.
${pdfNote}

ORDER:        ${order.orderId}
WAYBILL:      ${waybillNumber}
CUSTOMER:     ${order.customerName}
PHONE:        ${order.customerPhone ?? "n/a"}
COD AMOUNT:   ${formatPrice(order.total)}
DESTINATION:  ${order.shippingAddress.city}

ITEMS:
${formatItemsList(order.items)}

ADDRESS:
  ${formatAddress(order.shippingAddress)}

Print ${pdfBuffer ? "the attached delivery-note.pdf" : "the waybill from the Curfox portal"} and hand the parcel + label to the Royal Express pickup rider.

─────────────
Dressing Bear · automated dispatch
`.trim();

  const itemsHtml = order.items
    .map((it) => `<li>${escapeHtml(it.name)}${it.size ? ` (${escapeHtml(it.size)})` : ""} &times; ${it.quantity}</li>`)
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .section { margin-bottom: 20px; padding: 15px; border: 1px solid #eee; border-radius: 8px; }
    .label { font-weight: bold; color: #666; width: 120px; display: inline-block; }
    .urgent { color: #e74c3c; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; color: #2c3e50;">${escapeHtml(BRAND_NAME)}</h1>
      <h2 style="margin: 10px 0 0 0; color: #27ae60;">Dispatch Notification</h2>
    </div>

    <p>A new COD order has been booked with Royal Express via Curfox.</p>
    ${pdfBuffer ? "<p class=\"urgent\">The printable airwaybill is attached as delivery-note.pdf.</p>" : "<p class=\"urgent\">⚠ The PDF could not be fetched from Curfox. Please download it from the merchant portal.</p>"}

    <div class="section">
      <p><span class="label">Order ID:</span> ${escapeHtml(order.orderId)}</p>
      <p><span class="label">Waybill:</span> <strong>${escapeHtml(waybillNumber)}</strong></p>
      <p><span class="label">Customer:</span> ${escapeHtml(order.customerName)}</p>
      <p><span class="label">Phone:</span> ${escapeHtml(order.customerPhone ?? "n/a")}</p>
      <p><span class="label">COD Amount:</span> <strong>${formatPrice(order.total)}</strong></p>
      <p><span class="label">Destination:</span> ${escapeHtml(order.shippingAddress.city)}</p>
    </div>

    <div class="section">
      <h3>Items</h3>
      <ul>${itemsHtml}</ul>
    </div>

    <div class="section">
      <h3>Shipping Address</h3>
      <p>${escapeHtml(formatAddress(order.shippingAddress)).replace(/\n/g, "<br>")}</p>
    </div>

    <p>Print ${pdfBuffer ? "the attached <strong>delivery-note.pdf</strong>" : "the waybill from the <strong>Curfox portal</strong>"} and hand the parcel + label to the Royal Express pickup rider.</p>

    <div style="margin-top: 30px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 10px;">
      ${escapeHtml(BRAND_NAME)} &middot; automated dispatch
    </div>
  </div>
</body>
</html>
  `.trim();

  await transport.sendMail({
    from,
    to: brandEmail,
    replyTo: brandReplyTo(),
    subject: `[Dispatch] Order ${order.orderId} — Waybill ${waybillNumber}`,
    text,
    html,
    attachments: pdfBuffer
      ? [{ filename: "delivery-note.pdf", content: pdfBuffer }]
      : undefined,
  });
}

export async function sendPendingPrepaidNotificationEmail(params: {
  order: OrderDetails;
}): Promise<void> {
  const { order } = params;
  const transport = getTransport();
  const brandEmail = requireBrandEmail();
  const from = requireFrom();
  const gateway = order.paymentMethodDisplay ?? order.paymentMethod;

  const text = `A new prepaid order has been placed. Courier booking is
DEFERRED until the payment gateway confirms the transaction.
Do NOT ship this order yet.

ORDER:        ${order.orderId}
CUSTOMER:     ${order.customerName}
PAYMENT:      ${gateway} (pending)
TOTAL:        ${formatPrice(order.total)}

ITEMS:
${formatItemsList(order.items)}

ADDRESS:
  ${formatAddress(order.shippingAddress)}

When the gateway confirms (or you confirm manually in the dashboard),
the courier booking will need to be triggered.

─────────────
Dressing Bear · automated dispatch
`.trim();

  const itemsHtml = order.items
    .map((it) => `<li>${escapeHtml(it.name)}${it.size ? ` (${escapeHtml(it.size)})` : ""} &times; ${it.quantity}</li>`)
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #fff3cd; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #ffeeba; }
    .section { margin-bottom: 20px; padding: 15px; border: 1px solid #eee; border-radius: 8px; }
    .label { font-weight: bold; color: #666; width: 120px; display: inline-block; }
    .warning { color: #856404; font-weight: bold; background: #fff3cd; padding: 10px; border-radius: 4px; border: 1px solid #ffeeba; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; color: #2c3e50;">${escapeHtml(BRAND_NAME)}</h1>
      <h2 style="margin: 10px 0 0 0; color: #856404;">Pending Payment Notification</h2>
    </div>

    <div class="warning">
      A new prepaid order has been placed. Courier booking is <strong>DEFERRED</strong> until the payment gateway confirms the transaction. <strong>Do NOT ship this order yet.</strong>
    </div>

    <div class="section">
      <p><span class="label">Order ID:</span> ${escapeHtml(order.orderId)}</p>
      <p><span class="label">Customer:</span> ${escapeHtml(order.customerName)}</p>
      <p><span class="label">Payment:</span> ${escapeHtml(gateway)} (pending)</p>
      <p><span class="label">Total:</span> <strong>${formatPrice(order.total)}</strong></p>
    </div>

    <div class="section">
      <h3>Items</h3>
      <ul>${itemsHtml}</ul>
    </div>

    <div class="section">
      <h3>Shipping Address</h3>
      <p>${escapeHtml(formatAddress(order.shippingAddress)).replace(/\n/g, "<br>")}</p>
    </div>

    <p>When the gateway confirms (or you confirm manually in the dashboard), the courier booking will need to be triggered.</p>

    <div style="margin-top: 30px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 10px;">
      ${escapeHtml(BRAND_NAME)} &middot; automated dispatch
    </div>
  </div>
</body>
</html>
  `.trim();

  await transport.sendMail({
    from,
    to: brandEmail,
    replyTo: brandReplyTo(),
    subject: `[PENDING PAYMENT] Order ${order.orderId} — ${formatPrice(order.total)} via ${gateway}`,
    text,
    html,
  });
}

const NEXT_ACTION_BY_STEP: Record<
  "city-lookup" | "curfox-login" | "curfox-create" | "curfox-persist" | "curfox-pdf" | "orchestrate-courier",
  (orderId: string, ctx: { city?: string; waybillNumber?: string }) => string
> = {
  "city-lookup": (_o, c) =>
    `The city "${c.city ?? "<unknown>"}" is not in our Curfox city map. Either add it via the admin city-refresh route, or book this order manually in the Curfox portal.`,
  "curfox-login": () =>
    `Curfox login is failing. Verify ROYAL_EXPRESS_USER / ROYAL_EXPRESS_PASS in production env. Until fixed, all COD orders will need manual booking.`,
  "curfox-create": () =>
    `Curfox rejected the order payload. Review the response body above — likely an address-format or city-id mismatch. Book manually at https://royalexpress.merchant.curfox.com/`,
  "curfox-persist": (_o, c) =>
    `⚠ URGENT — Order was booked at Curfox (waybill ${c.waybillNumber ?? "<unknown>"}) but the local DB write failed. The order will not appear as "booked" in our system. Reconcile manually.`,
  "curfox-pdf": (_o, c) =>
    `The order was booked at Curfox (waybill ${c.waybillNumber ?? "<unknown>"}) but we could not fetch the printable PDF. Download it from https://royalexpress.merchant.curfox.com/`,
  "orchestrate-courier": () =>
    "An unexpected error occurred in the checkout orchestration layer. Review the server logs and the error detail above.",
};

export async function sendAdminFailureAlertEmail(params: {
  orderId: string;
  step: "city-lookup" | "curfox-login" | "curfox-create" | "curfox-persist" | "curfox-pdf" | "orchestrate-courier";
  reason: string;
  errorDetail?: string;
  order: OrderDetails;
  context?: { city?: string; waybillNumber?: string };
}): Promise<void> {
  const { orderId, step, reason, errorDetail, order, context } = params;
  const transport = getTransport();
  const brandEmail = requireBrandEmail();
  const from = requireFrom();

  const urgentPrefix = step === "curfox-persist" ? "[URGENT] " : "";
  const nextAction = NEXT_ACTION_BY_STEP[step](orderId, context ?? {});

  const text = `A Dressing Bear order saved successfully but the downstream
courier/dispatch step failed. The customer was NOT shown an
error. Manual action may be required.

ORDER DETAILS
─────────────
Order ID:      ${orderId}
Placed:        ${new Date().toISOString()}
Customer:      ${order.customerName}
Email:         ${order.customerEmail}
Phone:         ${order.customerPhone ?? "n/a"}
Payment:       ${order.paymentMethodDisplay ?? order.paymentMethod}
Total:         ${formatPrice(order.total)}

ITEMS:
${formatItemsList(order.items)}

SHIPPING ADDRESS
────────────────
  ${formatAddress(order.shippingAddress)}

FAILURE
───────
Step:          ${step}
Reason:        ${reason}
Server time:   ${new Date().toISOString()}

${errorDetail ? `DETAIL\n──────\n    ${errorDetail.split("\n").join("\n    ")}\n\n` : ""}NEXT ACTION
───────────
${nextAction}

─────────────
Dressing Bear · automated alert
`.trim();

  const itemsHtml = order.items
    .map((it) => `<li>${escapeHtml(it.name)}${it.size ? ` (${escapeHtml(it.size)})` : ""} &times; ${it.quantity}</li>`)
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f8d7da; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #f5c6cb; }
    .section { margin-bottom: 20px; padding: 15px; border: 1px solid #eee; border-radius: 8px; }
    .label { font-weight: bold; color: #666; width: 120px; display: inline-block; }
    .error-box { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 8px; border: 1px solid #f5c6cb; margin-bottom: 20px; }
    .next-action { background: #d4edda; color: #155724; padding: 15px; border-radius: 8px; border: 1px solid #c3e6cb; }
    pre { background: #f8f9fa; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; color: #2c3e50;">${escapeHtml(BRAND_NAME)}</h1>
      <h2 style="margin: 10px 0 0 0; color: #721c24;">Courier Dispatch Failure</h2>
    </div>

    <p>A Dressing Bear order saved successfully but the downstream courier/dispatch step failed. The customer was <strong>NOT</strong> shown an error. Manual action may be required.</p>

    <div class="error-box">
      <h3 style="margin-top: 0;">Failure Details</h3>
      <p><span class="label">Step:</span> ${escapeHtml(step)}</p>
      <p><span class="label">Reason:</span> ${escapeHtml(reason)}</p>
      <p><span class="label">Server Time:</span> ${new Date().toISOString()}</p>
    </div>

    <div class="next-action">
      <h3 style="margin-top: 0;">Next Action</h3>
      <p>${escapeHtml(nextAction)}</p>
    </div>

    ${errorDetail ? `<h3>Error Detail</h3><pre>${escapeHtml(errorDetail)}</pre>` : ""}

    <div class="section">
      <h3>Order Details</h3>
      <p><span class="label">Order ID:</span> ${escapeHtml(orderId)}</p>
      <p><span class="label">Customer:</span> ${escapeHtml(order.customerName)}</p>
      <p><span class="label">Email:</span> ${escapeHtml(order.customerEmail)}</p>
      <p><span class="label">Phone:</span> ${escapeHtml(order.customerPhone ?? "n/a")}</p>
      <p><span class="label">Payment:</span> ${escapeHtml(order.paymentMethodDisplay ?? order.paymentMethod)}</p>
      <p><span class="label">Total:</span> <strong>${formatPrice(order.total)}</strong></p>
    </div>

    <div class="section">
      <h3>Items</h3>
      <ul>${itemsHtml}</ul>
    </div>

    <div class="section">
      <h3>Shipping Address</h3>
      <p>${escapeHtml(formatAddress(order.shippingAddress)).replace(/\n/g, "<br>")}</p>
    </div>

    <div style="margin-top: 30px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 10px;">
      ${escapeHtml(BRAND_NAME)} &middot; automated alert
    </div>
  </div>
</body>
</html>
  `.trim();

  await transport.sendMail({
    from,
    to: brandEmail,
    replyTo: brandReplyTo(),
    subject: `${urgentPrefix}[Dressing Bear] Order ${orderId} — Curfox ${step} failed`,
    text,
    html,
  });
}
