import { describe, it, expect } from "vitest";
import {
  CurfoxLoginResponseSchema,
  CurfoxOrderResponseSchema,
  CurfoxCityListResponseSchema,
  CurfoxCreateOrderInputSchema,
  CurfoxOrderDataItemSchema,
  CurfoxGeneralDataSchema,
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
  it("parses the staging-probe success response", () => {
    const sample = {
      message: "Orders Created Successfully",
      data: ["RA03872055"],
    };
    const parsed = CurfoxOrderResponseSchema.parse(sample);
    expect(parsed.message).toBe("Orders Created Successfully");
    expect(parsed.data[0]).toBe("RA03872055");
  });

  it("parses multi-waybill responses (bulk endpoint shape)", () => {
    const parsed = CurfoxOrderResponseSchema.parse({
      message: "Orders Created Successfully",
      data: ["RA1", "RA2", "RA3"],
    });
    expect(parsed.data).toHaveLength(3);
  });

  it("rejects empty data array", () => {
    expect(() => CurfoxOrderResponseSchema.parse({ message: "OK", data: [] })).toThrow();
  });

  it("rejects missing message", () => {
    expect(() => CurfoxOrderResponseSchema.parse({ data: ["RA1"] })).toThrow();
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

describe("CurfoxGeneralDataSchema", () => {
  it("requires merchant_business_id, origin_city_id, origin_warehouse_id", () => {
    expect(
      CurfoxGeneralDataSchema.parse({
        merchant_business_id: 7290,
        origin_city_id: 1500,
        origin_warehouse_id: 78,
      }),
    ).toEqual({ merchant_business_id: 7290, origin_city_id: 1500, origin_warehouse_id: 78 });
  });
  it("rejects missing merchant_business_id", () => {
    expect(() =>
      CurfoxGeneralDataSchema.parse({ origin_city_id: 1500, origin_warehouse_id: 78 }),
    ).toThrow();
  });
});

describe("CurfoxOrderDataItemSchema", () => {
  const base = {
    order_no: "ORD-1",
    customer_name: "Jane Doe",
    customer_address: "1 Walls Lane, Colombo 15",
    customer_phone: "+94778207539",
    weight: 1,
    cod: 0,
    description: "Clothes",
  } as const;

  it("accepts destination_city_id alone", () => {
    expect(() =>
      CurfoxOrderDataItemSchema.parse({ ...base, destination_city_id: 419 }),
    ).not.toThrow();
  });

  it("accepts destination_city_name + destination_state_name", () => {
    expect(() =>
      CurfoxOrderDataItemSchema.parse({
        ...base,
        destination_city_name: "Kotte",
        destination_state_name: "Western",
      }),
    ).not.toThrow();
  });

  it("rejects when neither destination_city_id nor destination_city_name is given", () => {
    expect(() => CurfoxOrderDataItemSchema.parse(base)).toThrow();
  });

  it("rejects negative cod", () => {
    expect(() =>
      CurfoxOrderDataItemSchema.parse({ ...base, destination_city_id: 419, cod: -1 }),
    ).toThrow();
  });
});

describe("CurfoxCreateOrderInputSchema (full envelope)", () => {
  it("accepts the verified single-order envelope shape", () => {
    const envelope = {
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
    const parsed = CurfoxCreateOrderInputSchema.parse(envelope);
    expect(parsed.order_data).toHaveLength(1);
    expect(parsed.general_data.merchant_business_id).toBe(7290);
  });

  it("accepts a multi-order array (bulk endpoint shape)", () => {
    const envelope = {
      general_data: { merchant_business_id: 7290, origin_city_id: 1500, origin_warehouse_id: 78 },
      order_data: [
        {
          order_no: "ORD-1",
          customer_name: "A",
          customer_address: "addr",
          customer_phone: "+94770000000",
          weight: 1,
          destination_city_name: "Kotte",
          destination_state_name: "Western",
          cod: 100,
          description: "X",
        },
        {
          order_no: "ORD-2",
          customer_name: "B",
          customer_address: "addr",
          customer_phone: "+94770000001",
          weight: 1,
          destination_city_id: 419,
          cod: 200,
          description: "Y",
        },
      ],
    };
    expect(() => CurfoxCreateOrderInputSchema.parse(envelope)).not.toThrow();
  });

  it("rejects empty order_data array", () => {
    expect(() =>
      CurfoxCreateOrderInputSchema.parse({
        general_data: { merchant_business_id: 7290, origin_city_id: 1500, origin_warehouse_id: 78 },
        order_data: [],
      }),
    ).toThrow();
  });
});
