import { describe, it, expect } from "vitest";
import { shouldEmailCustomer } from "@/app/_lib/mailer-guard";

describe("shouldEmailCustomer", () => {
  it("is true for a real address", () => {
    expect(shouldEmailCustomer("a@b.test")).toBe(true);
  });
  it("is false for empty / whitespace (phone-only customer)", () => {
    expect(shouldEmailCustomer("")).toBe(false);
    expect(shouldEmailCustomer("   ")).toBe(false);
  });
});
