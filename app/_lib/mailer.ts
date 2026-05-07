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

function getTransport(): nodemailer.Transporter {
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
      return `${item.name}${sizeStr} x${item.quantity} - ${formatPrice(item.price)}`;
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
