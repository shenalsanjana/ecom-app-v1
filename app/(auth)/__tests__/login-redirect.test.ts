import { describe, it, expect } from "vitest";
import { chooseLoginRedirect } from "../login-redirect";

describe("chooseLoginRedirect", () => {
  describe("admin", () => {
    it("defaults to /admin when callbackUrl is '/'", () => {
      expect(chooseLoginRedirect("ADMIN", "/")).toBe("/admin");
    });

    it("defaults to /admin when callbackUrl is empty string", () => {
      expect(chooseLoginRedirect("ADMIN", "")).toBe("/admin");
    });

    it("honours an explicit /admin/something callbackUrl", () => {
      expect(chooseLoginRedirect("ADMIN", "/admin/orders")).toBe("/admin/orders");
    });

    it("honours a non-admin callbackUrl (admin can also act as customer)", () => {
      expect(chooseLoginRedirect("ADMIN", "/checkout")).toBe("/checkout");
      expect(chooseLoginRedirect("ADMIN", "/account/orders")).toBe("/account/orders");
    });
  });

  describe("customer", () => {
    it("returns callbackUrl when it is '/'", () => {
      expect(chooseLoginRedirect("CUSTOMER", "/")).toBe("/");
    });

    it("returns callbackUrl when set", () => {
      expect(chooseLoginRedirect("CUSTOMER", "/checkout")).toBe("/checkout");
    });

    it("returns '/' for empty callbackUrl", () => {
      expect(chooseLoginRedirect("CUSTOMER", "")).toBe("/");
    });
  });
});
