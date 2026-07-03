import { describe, it, expect } from "vitest";
import { canonicalizeLkPhone, resolveIdentifier, LkMobileSchema } from "../phone";

describe("canonicalizeLkPhone", () => {
  it("collapses every LK mobile form to one E.164 key", () => {
    for (const input of [
      "0771234567", "+94771234567", "94771234567", "771234567",
      "077 123 4567", "077-123-4567", "(077) 123 4567",
    ]) {
      expect(canonicalizeLkPhone(input)).toBe("+94771234567");
    }
  });
});

describe("resolveIdentifier", () => {
  it("treats an @-string as email (trim only, case preserved)", () => {
    expect(resolveIdentifier("  User@B.com ")).toEqual({ kind: "email", value: "User@B.com" });
  });
  it("treats anything else as a canonical phone", () => {
    expect(resolveIdentifier("0771234567")).toEqual({ kind: "phone", value: "+94771234567" });
  });
});

describe("LkMobileSchema", () => {
  it("accepts a mobile and returns the canonical form", () => {
    expect(LkMobileSchema.parse("0771234567")).toBe("+94771234567");
  });
  it("rejects a landline (non-7 subscriber)", () => {
    expect(LkMobileSchema.safeParse("0112345678").success).toBe(false);
  });
});
