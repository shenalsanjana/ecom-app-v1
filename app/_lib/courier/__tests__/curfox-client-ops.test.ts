import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createCurfoxOrder,
  __test_only_resetTokenCache,
} from "../curfox-client";
import type { CurfoxCreateOrderInput } from "../curfox-types";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

const VALID_ENVELOPE: CurfoxCreateOrderInput = {
  general_data: {
    merchant_business_id: 7290,
    origin_city_id: 1500,
    origin_warehouse_id: 78,
  },
  order_data: [
    {
      order_no: "ORD-1",
      customer_name: "Jane Doe",
      customer_address: "1 Walls Lane, Colombo 15",
      customer_phone: "+94778207539",
      weight: 1,
      destination_city_id: 419,
      cod: 2440,
      description: "Clothes",
    },
  ],
};

beforeEach(() => {
  __test_only_resetTokenCache();
  process.env.ROYAL_EXPRESS_USER = "test@example.com";
  process.env.ROYAL_EXPRESS_PASS = "secret";
  process.env.ROYAL_EXPRESS_TENANT = "royalexpress";
  process.env.CURFOX_LOGIN_BASE_URL = "https://login.example.com";
  process.env.CURFOX_BASE_URL = "https://api.example.com";
  process.env.CURFOX_ORDER_CREATE_PATH = "/api/merchant/order/single";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

function mockFetch(responses: Array<{ status: number; body: unknown | Uint8Array; contentType?: string }>) {
  let i = 0;
  globalThis.fetch = vi.fn(async () => {
    const r = responses[i++];
    if (!r) throw new Error("fetch called more times than expected");
    const ct = r.contentType ?? "application/json";
    const body =
      r.body instanceof Uint8Array
        ? r.body
        : typeof r.body === "string"
          ? r.body
          : JSON.stringify(r.body);
    return new Response(body as BodyInit, { status: r.status, headers: { "content-type": ct } });
  }) as typeof fetch;
}

describe("createCurfoxOrder", () => {
  it("posts the verified nested envelope and returns the waybill string", async () => {
    mockFetch([
      { status: 200, body: { token: "abc" } },
      {
        status: 200,
        body: { message: "Orders Created Successfully", data: ["RA03872055"] },
      },
    ]);
    const waybill = await createCurfoxOrder(VALID_ENVELOPE);
    expect(waybill).toBe("RA03872055");

    const orderCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(orderCall[0]).toBe("https://api.example.com/api/merchant/order/single");
    const init = orderCall[1] as RequestInit;
    const sent = JSON.parse(init.body as string);
    expect(sent.general_data.merchant_business_id).toBe(7290);
    expect(sent.general_data.origin_city_id).toBe(1500);
    expect(sent.general_data.origin_warehouse_id).toBe(78);
    expect(sent.order_data).toHaveLength(1);
    expect(sent.order_data[0].destination_city_id).toBe(419);
    expect(sent.order_data[0].order_no).toBe("ORD-1");
  });

  it("throws CurfoxError(step=create-order) on 422 with full body", async () => {
    mockFetch([
      { status: 200, body: { token: "abc" } },
      { status: 422, body: { message: "address too long" } },
    ]);
    await expect(createCurfoxOrder(VALID_ENVELOPE)).rejects.toMatchObject({
      name: "CurfoxError",
      step: "create-order",
      status: 422,
    });
  });

  it("rejects envelope with neither destination_city_id nor destination_city_name", async () => {
    const bad = {
      ...VALID_ENVELOPE,
      order_data: [{ ...VALID_ENVELOPE.order_data[0], destination_city_id: undefined }],
    };
    // Zod throws on .parse()
    await expect(createCurfoxOrder(bad as any)).rejects.toThrow();
  });
});

// fetchCurfoxWaybillPdf was removed: Curfox does not expose a server-side
// PDF endpoint. Tests for the PDF-fetch path are removed; see book-courier
// tests for the "dispatch email with portal link, no PDF" coverage.

