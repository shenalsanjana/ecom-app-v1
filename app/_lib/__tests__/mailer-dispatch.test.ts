import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import nodemailer from "nodemailer";
import {
  sendDispatchNotificationEmail,
  sendPendingPrepaidNotificationEmail,
  sendAdminFailureAlertEmail,
  __setTestTransport,
} from "../mailer";
import type { OrderDetails } from "../mailer";

const originalEnv = { ...process.env };

const SAMPLE_ORDER: OrderDetails = {
  orderId: "ORD-TEST-1",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  customerPhone: "+94770000000",
  items: [{ name: "Cotton T-Shirt", size: "M", price: 1200, quantity: 2 }],
  subtotal: 2400,
  shipping: 40,
  total: 2440,
  shippingAddress: {
    line1: "1 Walls Lane",
    city: "Colombo",
    country: "Sri Lanka",
  },
  paymentMethod: "COD",
  paymentMethodDisplay: "Cash on Delivery",
};

let transport: nodemailer.Transporter;
let sendMailSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  transport = nodemailer.createTransport({ jsonTransport: true });
  sendMailSpy = vi.fn(transport.sendMail.bind(transport)) as unknown as ReturnType<typeof vi.fn>;
  // @ts-expect-error patching for spy
  transport.sendMail = sendMailSpy;
  __setTestTransport(transport);

  process.env.SMTP_HOST = "smtp.test";
  process.env.SMTP_USER = "u";
  process.env.SMTP_PASS = "p";
  process.env.SMTP_FROM = "Dressing Bear <a9e490001@smtp-brevo.com>";
  process.env.BRAND_EMAIL = "dressingbear@gmail.com";
  process.env.BRAND_NAME = "Dressing Bear";
});

afterEach(() => {
  __setTestTransport(null);
  process.env = { ...originalEnv };
});

describe("sendDispatchNotificationEmail", () => {
  it("sends to dressingbear@gmail.com from the Brevo address, with PDF attached", async () => {
    await sendDispatchNotificationEmail({
      order: SAMPLE_ORDER,
      waybillNumber: "RA03870247",
      pdfBuffer: Buffer.from("%PDF-fake"),
    });
    expect(sendMailSpy).toHaveBeenCalledTimes(1);
    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.to).toBe("dressingbear@gmail.com");
    expect(opts.from).toBe("Dressing Bear <a9e490001@smtp-brevo.com>");
    expect(opts.replyTo).toBe("dressingbear@gmail.com");
    expect(opts.subject).toContain("RA03870247");
    expect(opts.subject).toContain("ORD-TEST-1");
    expect(opts.attachments).toHaveLength(1);
    expect(opts.attachments[0].filename).toBe("delivery-note.pdf");
    // nodemailer's jsonTransport may serialise the Buffer to base64 in-place;
    // we only care that a non-empty content was provided.
    expect(opts.attachments[0].content).toBeTruthy();
  });

  it("omits attachment when pdfBuffer is undefined and notes it in the body", async () => {
    await sendDispatchNotificationEmail({
      order: SAMPLE_ORDER,
      waybillNumber: "RA03870247",
    });
    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.attachments).toBeUndefined();
    expect(opts.text).toContain("PDF could not be fetched");
  });
});

describe("sendPendingPrepaidNotificationEmail", () => {
  it("uses [PENDING PAYMENT] subject prefix and never attaches a PDF", async () => {
    await sendPendingPrepaidNotificationEmail({
      order: { ...SAMPLE_ORDER, paymentMethod: "PAYHERE", paymentMethodDisplay: "PayHere" },
    });
    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.subject).toMatch(/^\[PENDING PAYMENT\]/);
    expect(opts.attachments).toBeUndefined();
    expect(opts.text).toContain("Do NOT ship");
  });
});

describe("sendAdminFailureAlertEmail", () => {
  it("renders the failure template with step-specific next-action", async () => {
    await sendAdminFailureAlertEmail({
      orderId: "ORD-TEST-1",
      step: "curfox-create",
      reason: "HTTP 422 — address too long",
      errorDetail: '{"errors":{"customer_address":["max 500"]}}',
      order: SAMPLE_ORDER,
    });
    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.subject).toContain("ORD-TEST-1");
    expect(opts.subject).toContain("curfox-create");
    expect(opts.text).toContain("HTTP 422 — address too long");
    expect(opts.text).toContain("customer_address");
    expect(opts.text).toContain("Book manually");
  });

  it("uses [URGENT] subject prefix for curfox-persist step", async () => {
    await sendAdminFailureAlertEmail({
      orderId: "ORD-TEST-1",
      step: "curfox-persist",
      reason: "DB write failed",
      order: SAMPLE_ORDER,
    });
    const opts = sendMailSpy.mock.calls[0][0];
    expect(opts.subject).toContain("[URGENT]");
  });
});
