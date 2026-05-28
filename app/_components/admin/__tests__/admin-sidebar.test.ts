import { describe, it, expect } from "vitest";
import { isActive } from "../admin-sidebar";

describe("isActive", () => {
  it("matches exact /admin (Dashboard) only at exactly /admin", () => {
    expect(isActive("/admin", "/admin")).toBe(true);
    expect(isActive("/admin", "/admin/orders")).toBe(false);
    expect(isActive("/admin", "/admin/orders/123")).toBe(false);
  });

  it("matches sub-route exact path", () => {
    expect(isActive("/admin/orders", "/admin/orders")).toBe(true);
  });

  it("matches nested paths under a sub-route", () => {
    expect(isActive("/admin/orders", "/admin/orders/123")).toBe(true);
    expect(isActive("/admin/products", "/admin/products/category/tees")).toBe(true);
  });

  it("does not match unrelated paths", () => {
    expect(isActive("/admin/orders", "/admin/products")).toBe(false);
    expect(isActive("/admin/orders", "/account")).toBe(false);
  });

  it("does not match partial path segments (Orders vs OrdersExtra)", () => {
    // The trailing-'/' rule in startsWith prevents /admin/orders matching /admin/ordersextra.
    expect(isActive("/admin/orders", "/admin/ordersextra")).toBe(false);
  });
});
