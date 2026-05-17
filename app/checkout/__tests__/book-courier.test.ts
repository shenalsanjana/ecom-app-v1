import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OrderDetails } from "@/app/_lib/mailer";

vi.mock("@/app/_lib/courier/curfox-client", () => ({
  createCurfoxOrder: vi.fn(),
  fetchCurfoxWaybillPdf: vi.fn(),
  CurfoxError: class CurfoxError extends Error {
    step: string;
    status?: number;
    responseBody?: string;
    constructor(message: string, step: string, status?: number, body?: string) {
      super(message);
      this.name = "CurfoxError";
      this.step = step;
      this.status = status;
      this.responseBody = body;
    }
  },
}));
vi.mock("@/app/_lib/mailer", () => ({
  sendDispatchNotificationEmail: vi.fn(),
  sendAdminFailureAlertEmail: vi.fn(),
}));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: {
      update: vi.fn(),
    },
  },
}));

import {
  createCurfoxOrder,
  fetchCurfoxWaybillPdf,
  CurfoxError as MockedCurfoxError,
} from "@/app/_lib/courier/curfox-client";
import {
  sendDispatchNotificationEmail,
  sendAdminFailureAlertEmail,
} from "@/app/_lib/mailer";
import { prisma } from "@/app/_lib/prisma";
import { bookCourierAndNotify } from "../book-courier";

const ORDER: OrderDetails = {
  orderId: "ORD-TEST-1",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  customerPhone: "+94770000000",
  items: [{ name: "T-Shirt", size: "M", price: 1200, quantity: 2 }],
  subtotal: 2400,
  shipping: 40,
  total: 2440,
  shippingAddress: {
    line1: "1 Walls Lane",
    city: "Kotte",
    region: "Western",
    postalCode: "00100",
    country: "Sri Lanka",
  },
  paymentMethod: "COD",
  paymentMethodDisplay: "Cash on Delivery",
};

beforeEach(() => {
  vi.mocked(createCurfoxOrder).mockReset();
  vi.mocked(fetchCurfoxWaybillPdf).mockReset();
  vi.mocked(sendDispatchNotificationEmail).mockReset();
  vi.mocked(sendAdminFailureAlertEmail).mockReset();
  vi.mocked(prisma.order.update).mockReset();
  vi.mocked(prisma.order.update).mockResolvedValue({} as never);
});

describe("bookCourierAndNotify — happy path", () => {
  it("sends direct city/region in the envelope, captures waybill + PDF, sends dispatch email", async () => {
    vi.mocked(createCurfoxOrder).mockResolvedValueOnce("RA03870247");
    vi.mocked(fetchCurfoxWaybillPdf).mockResolvedValueOnce(Buffer.from("%PDF-x"));
    vi.mocked(sendDispatchNotificationEmail).mockResolvedValueOnce(undefined);

    const waybill = await bookCourierAndNotify({ order: ORDER });

    expect(waybill).toBe("RA03870247");
    expect(createCurfoxOrder).toHaveBeenCalledOnce();
    const envelope = vi.mocked(createCurfoxOrder).mock.calls[0][0];
    expect(envelope.general_data.merchant_business_id).toBe(7290);
    expect(envelope.general_data.origin_city_id).toBe(1500);
    expect(envelope.general_data.origin_warehouse_id).toBe(78);
    expect(envelope.order_data).toHaveLength(1);
    expect(envelope.order_data[0].destination_city_name).toBe("Kotte");
    expect(envelope.order_data[0].destination_state_name).toBe("Western");
    expect(envelope.order_data[0].cod).toBe(2440);

    expect(sendDispatchNotificationEmail).toHaveBeenCalledOnce();
    const dispatchCall = vi.mocked(sendDispatchNotificationEmail).mock.calls[0][0];
    expect(dispatchCall.waybillNumber).toBe("RA03870247");
    expect(dispatchCall.pdfBuffer).toBeInstanceOf(Buffer);

    expect(fetchCurfoxWaybillPdf).toHaveBeenCalledWith("RA03870247");
    expect(prisma.order.update).toHaveBeenCalled();
    expect(sendAdminFailureAlertEmail).not.toHaveBeenCalled();
  });
});

describe("bookCourierAndNotify — failure cascade", () => {
  it("create-order failure → admin alert(curfox-create) with response body", async () => {
    vi.mocked(createCurfoxOrder).mockRejectedValueOnce(
      new MockedCurfoxError("HTTP 422", "create-order", 422, '{"errors":...}'),
    );

    const waybill = await bookCourierAndNotify({ order: ORDER });

    expect(waybill).toBeUndefined();
    expect(sendDispatchNotificationEmail).not.toHaveBeenCalled();
    expect(sendAdminFailureAlertEmail).toHaveBeenCalledOnce();
    const alert = vi.mocked(sendAdminFailureAlertEmail).mock.calls[0][0];
    expect(alert.step).toBe("curfox-create");
    expect(alert.errorDetail).toContain("errors");
  });

  it("PDF failure → still sends dispatch email without attachment + admin alert(curfox-pdf)", async () => {
    vi.mocked(createCurfoxOrder).mockResolvedValueOnce("RA03870247");
    vi.mocked(fetchCurfoxWaybillPdf).mockRejectedValueOnce(
      new MockedCurfoxError("HTTP 404", "fetch-pdf", 404),
    );

    const waybill = await bookCourierAndNotify({ order: ORDER });

    expect(waybill).toBe("RA03870247");
    expect(sendDispatchNotificationEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendDispatchNotificationEmail).mock.calls[0][0].pdfBuffer).toBeUndefined();
    expect(sendAdminFailureAlertEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendAdminFailureAlertEmail).mock.calls[0][0].step).toBe("curfox-pdf");
  });

  it("DB persist failure after Curfox booking → urgent admin alert(curfox-persist)", async () => {
    vi.mocked(createCurfoxOrder).mockResolvedValueOnce("RA03870247");
    vi.mocked(prisma.order.update).mockRejectedValueOnce(new Error("DB write failed"));

    const waybill = await bookCourierAndNotify({ order: ORDER });

    expect(waybill).toBe("RA03870247");
    expect(sendAdminFailureAlertEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendAdminFailureAlertEmail).mock.calls[0][0].step).toBe("curfox-persist");
  });

  it("never throws — even if every step fails", async () => {
    vi.mocked(createCurfoxOrder).mockRejectedValueOnce(new Error("Curfox down"));
    vi.mocked(sendAdminFailureAlertEmail).mockRejectedValueOnce(new Error("SMTP down"));

    await expect(bookCourierAndNotify({ order: ORDER })).resolves.toBeUndefined();
  });
});
