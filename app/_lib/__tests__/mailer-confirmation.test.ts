import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import { __setTestTransport, sendOrderConfirmationEmail, type OrderDetails } from "../mailer";

const originalEnv = { ...process.env };
const ORDER: OrderDetails = {
  orderId: "ORD-EMAIL-1", webNumber: "WEB1001", customerName: "Jane Doe",
  customerEmail: "jane@example.com", customerPhone: "+94770000000",
  items: [
    { name: "Cat Tee", color: "White", sku: "DB-CAT-WHT-M", size: "M", price: 2000, quantity: 2 },
    { name: "Bear Cap", color: null, sku: null, size: null, price: 1500, quantity: 1 },
  ],
  subtotal: 5500, shipping: 0, total: 5500,
  shippingAddress: { line1: "1 Walls Lane", city: "Colombo", country: "Sri Lanka" },
  paymentMethod: "COD", paymentMethodDisplay: "Cash on Delivery", paymentStatus: "COD_PENDING",
};
let transport: nodemailer.Transporter;
let sendMailSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  transport = nodemailer.createTransport({ jsonTransport: true });
  sendMailSpy = vi.fn(transport.sendMail.bind(transport)) as unknown as ReturnType<typeof vi.fn>;
  // @ts-expect-error patching for spy
  transport.sendMail = sendMailSpy;
  __setTestTransport(transport);
  Object.assign(process.env, { SMTP_HOST: "smtp.test", SMTP_USER: "u", SMTP_PASS: "p",
    SMTP_FROM: "Dressing Bear <a9e490001@smtp-brevo.com>", BRAND_EMAIL: "dressingbear@gmail.com", BRAND_NAME: "Dressing Bear" });
});
afterEach(() => { __setTestTransport(null); process.env = { ...originalEnv }; });

describe("sendOrderConfirmationEmail", () => {
  it("emails the customer with the brand bcc'd for a record", async () => {
    await sendOrderConfirmationEmail(ORDER);
    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.to).toBe("jane@example.com");
    expect(opts.bcc).toBe("dressingbear@gmail.com");
  });
});

describe("sendOrderConfirmationEmail item snapshots", () => {
  it("renders color in text and HTML item lines and omits customer-facing SKU", async () => {
    await sendOrderConfirmationEmail(ORDER);
    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.text).toContain("Cat Tee (Color White, Size M) x2");
    expect(opts.html).toContain("Color White");
    expect(opts.html).toContain("Size M");
    expect(opts.text).not.toContain("DB-CAT-WHT-M");
    expect(opts.html).not.toContain("DB-CAT-WHT-M");
  });
  it("omits missing color and size attributes for legacy items", async () => {
    await sendOrderConfirmationEmail(ORDER);
    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.text).toContain("Bear Cap x1");
    expect(opts.text).not.toContain("Bear Cap ()");
  });
});
