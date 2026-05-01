// app/_lib/mailer.ts
import nodemailer from "nodemailer";

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

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const transport = getTransport();
  const from = process.env.SMTP_FROM ?? `${BRAND_NAME} <no-reply@example.com>`;
  await transport.sendMail({
    from,
    to,
    subject: `Reset your ${BRAND_NAME} password`,
    text: `We received a request to reset your password.\n\nClick the link below to set a new password (valid for 30 minutes):\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
    html: `<p>We received a request to reset your password.</p>
<p><a href="${resetUrl}">Click here to set a new password</a> (valid for 30 minutes).</p>
<p>If you didn't request this, you can ignore this email.</p>`,
  });
}

export type OrderItem = {
  name: string;
  price: number;
  quantity: number;
};

export type OrderDetails = {
  orderId: string;
  customerName: string;
  customerEmail: string;
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
  paymentMethod: "COD";
  paymentMethodDisplay?: string;
  trackingCode?: string;
};

export async function sendOrderConfirmationEmail(order: OrderDetails): Promise<void> {
  const transport = getTransport();
  const brandEmail = process.env.BRAND_EMAIL ?? "dressingbear@gmail.com";
  const from = process.env.SMTP_FROM ?? `${BRAND_NAME} <no-reply@example.com>`;

  const itemsList = order.items
    .map((item) => `${item.name} x${item.quantity} - $${item.price.toFixed(2)}`)
    .join("\n");

  const text = `
New Order Received - ${BRAND_NAME}

Order ID: ${order.orderId}
Customer: ${order.customerName}
Email: ${order.customerEmail}
Payment Method: ${order.paymentMethodDisplay ?? "Cash on Delivery"}

Items:
${itemsList}

Subtotal: $${order.subtotal.toFixed(2)}
Shipping: $${order.shipping.toFixed(2)}
Total: $${order.total.toFixed(2)}

Shipping Address:
${order.shippingAddress.line1}
${order.shippingAddress.line2 ? order.shippingAddress.line2 + "\n" : ""}
${order.shippingAddress.city}, ${order.shippingAddress.region} ${order.shippingAddress.postalCode}
${order.shippingAddress.country}

Contact: ${CONTACT_NUMBER}
Email: ${brandEmail}

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
      <h1 style="margin: 0; color: #2c3e50;">${BRAND_NAME}</h1>
      <h2 style="margin: 10px 0 0 0; color: #27ae60;">New Order Received</h2>
    </div>

    <p><strong>Order ID:</strong> ${order.orderId}</p>
    <p><strong>Customer:</strong> ${order.customerName}</p>
    <p><strong>Email:</strong> ${order.customerEmail}</p>
    <p><strong>Payment Method:</strong> ${order.paymentMethodDisplay ?? "Cash on Delivery"}</p>
    ${order.trackingCode ? `<p><strong>Tracking Code:</strong> ${order.trackingCode}</p>` : ''}

    <div class="items">
      <h3 style="margin-top: 0;">Items</h3>
      ${order.items.map(item => `
        <div class="item">
          <span>${item.name} × ${item.quantity}</span>
          <span>$${item.price.toFixed(2)}</span>
        </div>
      `).join('')}
    </div>

    <p><strong>Subtotal:</strong> $${order.subtotal.toFixed(2)}</p>
    <p><strong>Shipping:</strong> $${order.shipping.toFixed(2)}</p>
    <p class="total"><strong>Total:</strong> $${order.total.toFixed(2)}</p>

    <div class="footer">
      <h3>Shipping Address</h3>
      <p>
        ${order.shippingAddress.line1}<br>
        ${order.shippingAddress.line2 ? order.shippingAddress.line2 + '<br>' : ''}
        ${order.shippingAddress.city}, ${order.shippingAddress.region} ${order.shippingAddress.postalCode}<br>
        ${order.shippingAddress.country}
      </p>
      <p><strong>Contact:</strong> ${CONTACT_NUMBER}</p>
      <p><strong>Email:</strong> ${brandEmail}</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  await transport.sendMail({
    from,
    to: brandEmail,
    subject: `New Order ${order.orderId} - ${BRAND_NAME}`,
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
  const brandEmail = process.env.BRAND_EMAIL ?? "dressingbear@gmail.com";
  const from = process.env.SMTP_FROM ?? `${BRAND_NAME} <no-reply@example.com>`;

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
      <h1 style="margin: 0; color: #2c3e50;">${BRAND_NAME}</h1>
      <h2 style="margin: 10px 0 0 0; color: #007bff;">New Contact Form Submission</h2>
    </div>

    <div class="field">
      <div class="label">Name:</div>
      <div>${name || "Not provided"}</div>
    </div>

    <div class="field">
      <div class="label">Email:</div>
      <div><a href="mailto:${email}">${email}</a></div>
    </div>

    <div class="field">
      <div class="label">Phone:</div>
      <div>${phone || "Not provided"}</div>
    </div>

    <div class="field">
      <div class="label">Message:</div>
      <div class="message-box">${message.replace(/\n/g, "<br>")}</div>
    </div>
  </div>
</body>
</html>
  `.trim();

  await transport.sendMail({
    from,
    to: brandEmail,
    subject: `New Contact: ${name || "Anonymous"} - ${email}`,
    text,
    html,
  });
}
