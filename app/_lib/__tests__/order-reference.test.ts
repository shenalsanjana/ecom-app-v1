import { describe, it, expect } from "vitest";
import { orderReference } from "../order-reference";

describe("orderReference", () => {
  it("prefers webNumber when set", () => {
    expect(
      orderReference({ webNumber: "WEB0042", rbNumber: "RB1001", orderId: "ORD-X" }),
    ).toBe("WEB0042");
  });

  it("falls back to rbNumber when webNumber is null/undefined", () => {
    expect(orderReference({ webNumber: null, rbNumber: "RB1001", orderId: "ORD-X" })).toBe("RB1001");
    expect(orderReference({ rbNumber: "RB1001", orderId: "ORD-X" })).toBe("RB1001");
  });

  it("falls back to orderId when both web and rb are missing", () => {
    expect(orderReference({ orderId: "ORD-X" })).toBe("ORD-X");
    expect(orderReference({ webNumber: null, rbNumber: null, orderId: "ORD-X" })).toBe("ORD-X");
  });

  it("falls back to id when orderId is missing (e.g., raw Prisma row)", () => {
    expect(orderReference({ id: "ORD-X" })).toBe("ORD-X");
  });

  it("returns empty string when nothing is set", () => {
    expect(orderReference({})).toBe("");
  });
});
