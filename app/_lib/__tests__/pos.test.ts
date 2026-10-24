import { describe, expect, it } from "vitest";
import { PosSaleSchema, posTotal, posChange, POS_MAX_CENTS } from "../pos";
import { randomUUID } from "node:crypto";

const sale = () => ({ operationKey: randomUUID(), items: [{ sizeStockId: "size-1", quantity: 2, expectedPrice: 199999 }],
  paymentMethod: "CASH", tendered: 400000 });

describe("POS validation and money", () => {
  it("keeps collection payloads unchanged and requires bank approval", () => {
    expect(PosSaleSchema.parse(sale())).not.toHaveProperty("delivery");
    expect(PosSaleSchema.safeParse({ ...sale(), paymentMethod: "BANK_TRANSFER" }).success).toBe(false);
    expect(PosSaleSchema.parse({ ...sale(), paymentMethod: "BANK_TRANSFER", paymentReference: " TRANSFER-123 " }).paymentReference).toBe("TRANSFER-123");
  });
  it("requires complete COD customer details and defers all payment", () => {
    const cod = { ...sale(), customerName: "Delivery customer", paymentMethod: "COD", tendered: 0,
      delivery: { carrier: "ROYAL_EXPRESS", phone: "0771234567", line1: "12 Test Road", line2: "", city: "Colombo", expectedCharge: 35000 } };
    expect(PosSaleSchema.safeParse(cod).success).toBe(true);
    for (const invalid of [{ ...cod, delivery: undefined }, { ...cod, customerName: "" }, { ...cod, tendered: 1 },
      { ...cod, delivery: { ...cod.delivery, phone: "123" } }, { ...cod, delivery: { ...cod.delivery, line1: "" } },
      { ...cod, delivery: { ...cod.delivery, city: "" } }]) expect(PosSaleSchema.safeParse(invalid).success).toBe(false);
  });
  it("keeps the secondary delivery phone optional and normalizes it like online checkout", () => {
    const input = { ...sale(), customerName: "Delivery customer", paymentMethod: "COD", tendered: 0,
      delivery: { carrier: "ROYAL_EXPRESS", phone: "0771234567", line1: "12 Test Road", line2: "", city: "Colombo", expectedCharge: 35000 } };
    expect(PosSaleSchema.parse(input).delivery).not.toHaveProperty("alternatePhone");
    expect(PosSaleSchema.parse({ ...input, delivery: { ...input.delivery, alternatePhone: " (071) 222-3333 " } }).delivery?.alternatePhone).toBe("0712223333");
    for (const alternatePhone of ["123", "not a phone", "0000000000"]) {
      expect(PosSaleSchema.safeParse({ ...input, delivery: { ...input.delivery, alternatePhone } }).success).toBe(false);
    }
  });
  it("calculates sub-rupee prices and change in integer cents", () => {
    const total = posTotal([{ price: 199999, quantity: 2 }, { price: 25050, quantity: 3 }]);
    expect(total).toBe(475148);
    expect(posChange(total, 500000)).toBe(24852);
    expect(posChange(total, total)).toBe(0);
  });
  it("rejects underpayment, invalid amounts and unsupported totals", () => {
    for (const [total, tendered] of [[100, 99], [100, NaN], [0, 100], [100.5, 200], [POS_MAX_CENTS + 1, POS_MAX_CENTS + 1]]) {
      expect(() => posChange(total, tendered)).toThrow();
    }
  });
  it("rejects duplicate lines, fractional quantities and excessive money", () => {
    const input = sale();
    expect(PosSaleSchema.safeParse({ ...input, items: [...input.items, ...input.items] }).success).toBe(false);
    expect(PosSaleSchema.safeParse({ ...input, items: [{ ...input.items[0], quantity: 0.5 }] }).success).toBe(false);
    expect(PosSaleSchema.safeParse({ ...input, tendered: POS_MAX_CENTS + 1 }).success).toBe(false);
  });
  it.each(["KOKO", "MINTPAY"])("requires a trimmed approval reference for %s", paymentMethod => {
    expect(PosSaleSchema.safeParse({ ...sale(), paymentMethod, paymentReference: "  " }).success).toBe(false);
    expect(PosSaleSchema.parse({ ...sale(), paymentMethod, paymentReference: " APPROVED-123 " })).toMatchObject({ paymentMethod, paymentReference: "APPROVED-123" });
  });
  it("requires an approved reference for card sales and excludes browser-supplied totals/status", () => {
    expect(PosSaleSchema.safeParse({ ...sale(), paymentMethod: "CARD", paymentReference: " " }).success).toBe(false);
    expect(PosSaleSchema.parse({ ...sale(), paymentMethod: "CARD", paymentReference: " AUTH123 " }).paymentReference).toBe("AUTH123");
    expect(PosSaleSchema.safeParse({ ...sale(), total: 1, status: "PAID" }).success).toBe(false);
  });
});
