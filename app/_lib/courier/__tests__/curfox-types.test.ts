import { describe, it, expect } from "vitest";
import {
  CurfoxLoginResponseSchema,
  CurfoxOrderResponseSchema,
  CurfoxCityListResponseSchema,
  CurfoxCreateOrderInputSchema,
} from "../curfox-types";

describe("CurfoxLoginResponseSchema", () => {
  it("accepts { token }", () => {
    expect(CurfoxLoginResponseSchema.parse({ token: "abc" })).toEqual({ token: "abc" });
  });
  it("accepts { access_token }", () => {
    expect(CurfoxLoginResponseSchema.parse({ access_token: "abc" })).toEqual({ access_token: "abc" });
  });
  it("accepts { data: { token } }", () => {
    expect(CurfoxLoginResponseSchema.parse({ data: { token: "abc" } })).toEqual({ data: { token: "abc" } });
  });
  it("rejects empty token", () => {
    expect(() => CurfoxLoginResponseSchema.parse({ token: "" })).toThrow();
  });
});

describe("CurfoxOrderResponseSchema", () => {
  it("parses the sample order create response", () => {
    const sample = {
      data: {
        id: 9249611,
        waybill_number: "RA03870247",
        order_no: "116",
        customer_name: "Oshini Yapa",
        cod: 2440,
        delivery_charge: 450,
      },
    };
    const parsed = CurfoxOrderResponseSchema.parse(sample);
    expect(parsed.data.waybill_number).toBe("RA03870247");
    expect(parsed.data.id).toBe(9249611);
  });
  it("rejects missing waybill_number", () => {
    expect(() =>
      CurfoxOrderResponseSchema.parse({
        data: { id: 1, order_no: "1", customer_name: "X", cod: 0 },
      }),
    ).toThrow();
  });
});

describe("CurfoxCityListResponseSchema", () => {
  it("parses a list with one city", () => {
    const out = CurfoxCityListResponseSchema.parse({
      data: [{ id: 1500, name: "Kotte", default_warehouse_id: 78 }],
    });
    expect(out.data[0].id).toBe(1500);
  });
});

describe("CurfoxCreateOrderInputSchema", () => {
  it("accepts a valid minimal payload", () => {
    const ok = CurfoxCreateOrderInputSchema.parse({
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
    });
    expect(ok.cod).toBe(2440);
  });
  it("rejects negative cod", () => {
    expect(() =>
      CurfoxCreateOrderInputSchema.parse({
        order_no: "ORD-1",
        customer_name: "Jane",
        customer_address: "addr",
        customer_phone: "+94770000000",
        weight: 1,
        origin_city_id: 1500,
        origin_warehouse_id: 78,
        destination_city_id: 419,
        cod: -1,
        description: "X",
      }),
    ).toThrow();
  });
});
