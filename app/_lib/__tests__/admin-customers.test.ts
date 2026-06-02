import { describe, it, expect } from "vitest";
import { buildCustomerWhere } from "../admin-customers";
import { CUSTOMER_TABS } from "../customer-tabs";

describe("CUSTOMER_TABS", () => {
  it("is customers/admins/all", () => {
    expect(CUSTOMER_TABS).toEqual(["customers", "admins", "all"]);
  });
});

describe("buildCustomerWhere", () => {
  it("customers tab → role CUSTOMER", () => {
    expect(buildCustomerWhere({ role: "customers" })).toEqual({ role: "CUSTOMER" });
  });
  it("admins tab → role ADMIN", () => {
    expect(buildCustomerWhere({ role: "admins" })).toEqual({ role: "ADMIN" });
  });
  it("all tab → no role filter", () => {
    expect(buildCustomerWhere({ role: "all" })).toEqual({});
  });
  it("defaults (no tab) to customers", () => {
    expect(buildCustomerWhere({})).toEqual({ role: "CUSTOMER" });
  });
  it("adds case-insensitive search on name + email", () => {
    const w = buildCustomerWhere({ role: "all", q: "nimali" });
    expect(w.OR).toEqual([
      { name: { contains: "nimali", mode: "insensitive" } },
      { email: { contains: "nimali", mode: "insensitive" } },
    ]);
  });
});
