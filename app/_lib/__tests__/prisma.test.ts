import { describe, it, expect } from "vitest";
import { withPoolDefaults } from "../prisma";

describe("withPoolDefaults", () => {
  it("appends connection_limit and pool_timeout when neither is present", () => {
    const url = "postgresql://user:pass@host:5432/db?schema=public";
    const out = withPoolDefaults(url);
    expect(out).toContain("schema=public");
    expect(out).toContain("connection_limit=2");
    expect(out).toContain("pool_timeout=20");
  });

  it("respects an operator-set connection_limit", () => {
    const url = "postgresql://user:pass@host/db?connection_limit=10";
    const out = withPoolDefaults(url);
    expect(out).toContain("connection_limit=10");
    expect(out).not.toContain("connection_limit=2");
    // pool_timeout is still defaulted because it wasn't set
    expect(out).toContain("pool_timeout=20");
  });

  it("respects an operator-set pool_timeout", () => {
    const url = "postgresql://user:pass@host/db?pool_timeout=5";
    const out = withPoolDefaults(url);
    expect(out).toContain("pool_timeout=5");
    expect(out).not.toContain("pool_timeout=20");
    expect(out).toContain("connection_limit=2");
  });

  it("returns undefined when url is undefined", () => {
    expect(withPoolDefaults(undefined)).toBeUndefined();
  });

  it("returns the input unchanged for an unparseable url string", () => {
    const garbage = "not a url";
    expect(withPoolDefaults(garbage)).toBe(garbage);
  });
});
