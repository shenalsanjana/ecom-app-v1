import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OrderDetails } from "@/app/_lib/mailer";

vi.mock("@/app/_lib/courier/curfox-client", () => ({
  createCurfoxOrder: vi.fn(),
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
  sendCustomerDispatchEmail: vi.fn(),
  sendAdminFailureAlertEmail: vi.fn(),
  logMailerError: vi.fn(),
}));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    order: {
      update: vi.fn(),
    },
    curfoxCity: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import {
  createCurfoxOrder,
  CurfoxError as MockedCurfoxError,
} from "@/app/_lib/courier/curfox-client";
import {
  sendDispatchNotificationEmail,
  sendCustomerDispatchEmail,
  sendAdminFailureAlertEmail,
} from "@/app/_lib/mailer";
import { prisma } from "@/app/_lib/prisma";
import { bookCourierAndNotify } from "../book-courier";

const ORDER: OrderDetails = {
  orderId: "ORD-TEST-1",
  webNumber: "WEB0001",
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
    country: "Sri Lanka",
  },
  paymentMethod: "COD",
  paymentMethodDisplay: "Cash on Delivery",
};

beforeEach(() => {
  vi.mocked(createCurfoxOrder).mockReset();
  vi.mocked(sendDispatchNotificationEmail).mockReset();
  vi.mocked(sendCustomerDispatchEmail).mockReset();
  vi.mocked(sendAdminFailureAlertEmail).mockReset();
  vi.mocked(prisma.order.update).mockReset();
  vi.mocked(prisma.order.update).mockResolvedValue({} as never);
});

describe("bookCourierAndNotify — happy path", () => {
  it("sends direct city in the envelope, captures waybill, sends dispatch email without PDF", async () => {
    vi.mocked(createCurfoxOrder).mockResolvedValueOnce("RA03870247");
    vi.mocked(sendDispatchNotificationEmail).mockResolvedValueOnce(undefined);

    const waybill = await bookCourierAndNotify({ order: ORDER });

    expect(waybill).toBe("RA03870247");
    expect(createCurfoxOrder).toHaveBeenCalledOnce();
    const envelope = vi.mocked(createCurfoxOrder).mock.calls[0][0];
    expect(envelope.general_data.merchant_business_id).toBe(7290);
    expect(envelope.general_data.origin_city_id).toBe(1500);
    expect(envelope.general_data.origin_warehouse_id).toBe(78);
    expect(envelope.order_data).toHaveLength(1);
    expect(envelope.order_data[0].destination_city_id).toBe(1500); // Kotte is in the hardcoded list
    expect(envelope.order_data[0].cod).toBe(2440);

    expect(sendDispatchNotificationEmail).toHaveBeenCalledOnce();
    const dispatchCall = vi.mocked(sendDispatchNotificationEmail).mock.calls[0][0];
    expect(dispatchCall.waybillNumber).toBe("RA03870247");
    // Curfox does not expose a server-side PDF endpoint; we send the email
    // with a portal link instead of a PDF attachment.
    expect(dispatchCall.pdfBuffer).toBeUndefined();

    expect(prisma.order.update).toHaveBeenCalled();
    expect(sendAdminFailureAlertEmail).not.toHaveBeenCalled();
  });

  it("flips status to DISPATCHED with Royal Express and emails the customer once", async () => {
    vi.mocked(createCurfoxOrder).mockResolvedValueOnce("RA03870247");
    vi.mocked(sendDispatchNotificationEmail).mockResolvedValueOnce(undefined);
    vi.mocked(sendCustomerDispatchEmail).mockResolvedValueOnce(undefined);

    await bookCourierAndNotify({ order: ORDER });

    const persist = vi
      .mocked(prisma.order.update)
      .mock.calls.find((c) => (c[0] as { data: Record<string, unknown> }).data.courierWaybillNumber);
    expect(persist).toBeDefined();
    const data = (persist![0] as { data: Record<string, unknown> }).data;
    expect(data.status).toBe("DISPATCHED");
    expect(data.deliveryCompany).toBe("Royal Express");

    expect(sendCustomerDispatchEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendCustomerDispatchEmail).mock.calls[0][0].trackingCode).toBe("RA03870247");
    expect(vi.mocked(sendCustomerDispatchEmail).mock.calls[0][0].customerEmail).toBe("jane@example.com");
  });
});

describe("bookCourierAndNotify — phone-only customer (no email)", () => {
  it("books successfully and skips the customer dispatch email when customerEmail is empty", async () => {
    vi.mocked(createCurfoxOrder).mockResolvedValueOnce("RA00000001");
    vi.mocked(sendDispatchNotificationEmail).mockResolvedValueOnce(undefined);

    const order: OrderDetails = { ...ORDER, customerEmail: "" };
    const waybill = await bookCourierAndNotify({ order });

    expect(waybill).toBe("RA00000001");
    expect(sendCustomerDispatchEmail).not.toHaveBeenCalled();
    // The admin-facing dispatch notification is unaffected by the customer's
    // email guard — it must still be sent.
    expect(sendDispatchNotificationEmail).toHaveBeenCalledOnce();
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

describe("bookCourierAndNotify — name-fallback payload", () => {
  it("books bare 'Colombo' via destination_city_name + destination_state_name", async () => {
    // Bare "Colombo" is not an exact match in KNOWN_CURFOX_CITIES (only
    // "Colombo 01..15"), so resolveCurfoxCity returns null and we fall back
    // to the name-pair envelope. The state must resolve to "Colombo" via
    // prefix match — otherwise Curfox's refine rejects the payload.
    vi.mocked(prisma.curfoxCity.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(createCurfoxOrder).mockResolvedValueOnce("RA09999999");
    vi.mocked(sendDispatchNotificationEmail).mockResolvedValueOnce(undefined);

    const order: OrderDetails = {
      ...ORDER,
      shippingAddress: { ...ORDER.shippingAddress, city: "Colombo" },
    };
    const waybill = await bookCourierAndNotify({ order });

    expect(waybill).toBe("RA09999999");
    const envelope = vi.mocked(createCurfoxOrder).mock.calls[0][0];
    expect(envelope.order_data[0].destination_city_id).toBeUndefined();
    expect(envelope.order_data[0].destination_city_name).toBe("Colombo");
    expect(envelope.order_data[0].destination_state_name).toBe("Colombo");
    expect(sendAdminFailureAlertEmail).not.toHaveBeenCalled();
  });

  it("short-circuits with city-lookup alert for an unmapped city — no Curfox call", async () => {
    vi.mocked(prisma.curfoxCity.findFirst).mockResolvedValueOnce(null as never);

    const order: OrderDetails = {
      ...ORDER,
      shippingAddress: { ...ORDER.shippingAddress, city: "Trincomalee" },
    };
    const waybill = await bookCourierAndNotify({ order });

    expect(waybill).toBeUndefined();
    expect(createCurfoxOrder).not.toHaveBeenCalled();
    expect(sendAdminFailureAlertEmail).toHaveBeenCalledOnce();
    const alert = vi.mocked(sendAdminFailureAlertEmail).mock.calls[0][0];
    expect(alert.step).toBe("city-lookup");
    expect(alert.context?.city).toBe("Trincomalee");
  });
});
