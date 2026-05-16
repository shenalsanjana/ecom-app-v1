import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createCurfoxOrder,
  fetchCurfoxWaybillPdf,
  listCurfoxCities,
  CurfoxError,
  __test_only_resetTokenCache,
} from "../curfox-client";
import type { CurfoxCreateOrderInput } from "../curfox-types";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

const VALID_INPUT: CurfoxCreateOrderInput = {
  order_no: "ORD-1",
  customer_name: "Jane Doe",
  customer_address: "1 Walls Lane, Colombo 15",
  customer_phone: "+94778207539",
  weight: 1,
  origin_city_id: 1500,
  origin_warehouse_id: 78,
  destination_city_id: 419,
  cod: 2440,
  description: "Clothes",
};

beforeEach(() => {
  __test_only_resetTokenCache();
  process.env.ROYAL_EXPRESS_USER = "test@example.com";
  process.env.ROYAL_EXPRESS_PASS = "secret";
  process.env.ROYAL_EXPRESS_TENANT = "royalexpress";
  process.env.CURFOX_LOGIN_BASE_URL = "https://login.example.com";
  process.env.CURFOX_BASE_URL = "https://api.example.com";
  process.env.CURFOX_ORDER_CREATE_PATH = "/api/merchant/order";
  process.env.CURFOX_WAYBILL_PDF_PATH_TEMPLATE = "/api/merchant/order/{id}/waybill";
  process.env.CURFOX_CITIES_PATH = "/api/merchant/city";
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
    return new Response(body, { status: r.status, headers: { "content-type": ct } });
  }) as typeof fetch;
}

describe("createCurfoxOrder", () => {
  it("posts to the configured path and returns the parsed data", async () => {
    mockFetch([
      { status: 200, body: { token: "abc" } },
      {
        status: 201,
        body: {
          data: {
            id: 9249611,
            waybill_number: "RA03870247",
            order_no: "ORD-1",
            customer_name: "Jane Doe",
            cod: 2440,
          },
        },
      },
    ]);
    const out = await createCurfoxOrder(VALID_INPUT);
    expect(out.waybill_number).toBe("RA03870247");
    expect(out.id).toBe(9249611);

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(call[0]).toBe("https://api.example.com/api/merchant/order");
  });

  it("throws CurfoxError(step=create-order) on 422 with full body", async () => {
    mockFetch([
      { status: 200, body: { token: "abc" } },
      { status: 422, body: { message: "address too long" } },
    ]);
    await expect(createCurfoxOrder(VALID_INPUT)).rejects.toMatchObject({
      name: "CurfoxError",
      step: "create-order",
      status: 422,
    });
  });
});

describe("fetchCurfoxWaybillPdf", () => {
  it("returns a Buffer when response is application/pdf", async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    mockFetch([
      { status: 200, body: { token: "abc" } },
      { status: 200, body: pdfBytes, contentType: "application/pdf" },
    ]);
    const buf = await fetchCurfoxWaybillPdf(9249611, "RA03870247");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.slice(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("follows JSON-wrapped download url", async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    mockFetch([
      { status: 200, body: { token: "abc" } },
      { status: 200, body: { url: "https://files.example.com/waybill.pdf" } },
      { status: 200, body: pdfBytes, contentType: "application/pdf" },
    ]);
    const buf = await fetchCurfoxWaybillPdf(9249611, "RA03870247");
    expect(buf.slice(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("throws CurfoxError(step=fetch-pdf) on unexpected content-type", async () => {
    mockFetch([
      { status: 200, body: { token: "abc" } },
      { status: 200, body: "<html>nope</html>", contentType: "text/html" },
    ]);
    await expect(fetchCurfoxWaybillPdf(1, "X")).rejects.toMatchObject({
      name: "CurfoxError",
      step: "fetch-pdf",
    });
  });

  it("substitutes both {id} and {waybill_number} in the template", async () => {
    process.env.CURFOX_WAYBILL_PDF_PATH_TEMPLATE = "/print/{waybill_number}/order/{id}";
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    mockFetch([
      { status: 200, body: { token: "abc" } },
      { status: 200, body: pdfBytes, contentType: "application/pdf" },
    ]);
    await fetchCurfoxWaybillPdf(9249611, "RA03870247");
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(url).toBe("https://api.example.com/print/RA03870247/order/9249611");
  });
});

describe("listCurfoxCities", () => {
  it("returns the parsed array", async () => {
    mockFetch([
      { status: 200, body: { token: "abc" } },
      {
        status: 200,
        body: {
          data: [
            { id: 1500, name: "Kotte", default_warehouse_id: 78 },
            { id: 419, name: "Ettampitiya", default_warehouse_id: 7 },
          ],
        },
      },
    ]);
    const cities = await listCurfoxCities();
    expect(cities).toHaveLength(2);
    expect(cities[0].id).toBe(1500);
  });

  it("throws CurfoxError(step=list-cities) on 500", async () => {
    mockFetch([
      { status: 200, body: { token: "abc" } },
      { status: 500, body: { message: "boom" } },
    ]);
    await expect(listCurfoxCities()).rejects.toMatchObject({
      name: "CurfoxError",
      step: "list-cities",
    });
  });
});
