import { describe, it, expect } from "vitest";
import { resolveCheckoutPrefill } from "../checkout-prefill";

const user = { name: "Jane", email: "jane@example.com", phone: "+94771234567" };
const addr = { line1: "1 Main St", line2: "Apt 2", city: "Colombo" };

describe("resolveCheckoutPrefill", () => {
  it("returns null when there is no db user (guest)", () => {
    expect(resolveCheckoutPrefill(null, null, "")).toBeNull();
  });

  it("fills name/email/phone and the default address", () => {
    expect(resolveCheckoutPrefill(user, addr, "Fallback")).toEqual({
      name: "Jane",
      email: "jane@example.com",
      phone: "+94771234567",
      address: { line1: "1 Main St", line2: "Apt 2", city: "Colombo" },
    });
  });

  it("phone-only user (null email) → empty email, address null when none saved", () => {
    expect(resolveCheckoutPrefill({ name: "P", email: null, phone: "+94770000000" }, null, "")).toEqual({
      name: "P",
      email: "",
      phone: "+94770000000",
      address: null,
    });
  });

  it("coerces a null address line2 to an empty string", () => {
    const out = resolveCheckoutPrefill(user, { line1: "1 Main St", line2: null, city: "Kandy" }, "");
    expect(out?.address).toEqual({ line1: "1 Main St", line2: "", city: "Kandy" });
  });

  it("uses the fallback name when the user row has no name", () => {
    expect(
      resolveCheckoutPrefill({ name: null, email: null, phone: null }, null, "Session Name")?.name,
    ).toBe("Session Name");
  });
});
