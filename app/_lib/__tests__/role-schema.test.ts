import { describe, it, expect } from "vitest";
import { RoleSchema } from "../validation";

describe("RoleSchema", () => {
  it("accepts ADMIN", () => {
    expect(RoleSchema.parse("ADMIN")).toBe("ADMIN");
  });

  it("accepts CUSTOMER", () => {
    expect(RoleSchema.parse("CUSTOMER")).toBe("CUSTOMER");
  });

  it("rejects lowercase admin", () => {
    expect(RoleSchema.safeParse("admin").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(RoleSchema.safeParse("").success).toBe(false);
  });

  it("rejects unknown roles", () => {
    expect(RoleSchema.safeParse("STAFF").success).toBe(false);
    expect(RoleSchema.safeParse("MANAGER").success).toBe(false);
  });
});
