// app/_lib/__tests__/signup-schema.test.ts
import { describe, it, expect } from "vitest";
import { SignupSchema } from "../validation";

const base = { name: "Amal", phone: "0771234567", password: "abcd1234", confirmPassword: "abcd1234" };

describe("SignupSchema", () => {
  it("canonicalizes the phone and allows a missing email", () => {
    const r = SignupSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.phone).toBe("+94771234567"); expect(r.data.email).toBeUndefined(); }
  });
  it("accepts an optional email", () => {
    const r = SignupSchema.safeParse({ ...base, email: "a@b.test" });
    expect(r.success && r.data.email).toBe("a@b.test");
  });
  it("rejects mismatched passwords", () => {
    expect(SignupSchema.safeParse({ ...base, confirmPassword: "nope1234" }).success).toBe(false);
  });
  it("rejects a landline", () => {
    expect(SignupSchema.safeParse({ ...base, phone: "0112345678" }).success).toBe(false);
  });
});
