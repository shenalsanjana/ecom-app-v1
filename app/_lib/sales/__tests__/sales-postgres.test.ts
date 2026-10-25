import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
const shared = vi.hoisted(() => ({ url: process.env.POS_TEST_DATABASE_URL, client: null as PrismaClient | null }));
vi.mock("@/app/_lib/prisma", async () => { const { PrismaClient } = await import("@prisma/client"); if (shared.url) { const u = new URL(shared.url); if (u.hostname !== "127.0.0.1" || u.port !== "55432" || u.pathname !== "/pos_test") throw new Error("Use only the isolated sales test database."); } shared.client = new PrismaClient({ datasourceUrl: shared.url ?? "postgresql://unused:unused@127.0.0.1:1/unused_test" }); return { prisma: shared.client }; });
const auth = vi.hoisted(() => vi.fn());
vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin: auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { readSalesReport, invalidateSalesReports, SalesRangeError } from "../service";
import { recordSalesRefund, voidSalesRefund, setHistoricalCosts } from "@/app/admin/sales/actions";
import type { RefundInput } from "../refunds";
const prefix = `sales-${randomUUID()}`, db = () => shared.client!, at = new Date("2026-02-01T02:00:00Z");
let product: string, stock: string, itemId: string;
const id = (key: string) => `${prefix}-${key}`;
const query = { period: "custom", start: "2026-02-01", end: "2026-02-01" };
function base(key: string) { return { id: id(key), customerPhone: "0771234567", shippingLine1: "Test", shippingCity: "Colombo", shippingCountry: "Sri Lanka", paymentMethod: "PAYHERE", paymentMethodDisplay: "Card", paymentStatus: "PAID", status: "DELIVERED", total: 2250, subtotal: 2000, shippingCost: 350, createdAt: new Date("2026-01-31T02:00:00Z"), salesPaidAt: at }; }
const input = (extra: Partial<RefundInput> = {}): RefundInput => ({ operationKey: randomUUID(), reference: "REF-1", reason: "Verified return", occurredAt: new Date("2026-02-01T03:00:00Z").toISOString(), shippingCents: 10000, verified: true, items: [{ orderItemId: itemId, amountCents: 50000, returnedQuantity: 1 }], ...extra });
describe.skipIf(!shared.url)("sales reporting with PostgreSQL", () => {
  beforeAll(async () => {
    await db().department.create({ data: { slug: prefix, name: prefix, navLabel: prefix, tileName: prefix, hex: "#fff" } });
    await db().design.create({ data: { slug: prefix, name: prefix, departmentSlug: prefix, hex: "#fff" } });
    product = (await db().product.create({ data: { id: prefix, name: "Report Tote", price: 1000, description: "Sales fixture", departmentSlug: prefix, designSlug: prefix, status: "PUBLISHED" } })).id;
    const category = await db().inventoryCategory.create({ data: { name: prefix } }); const family = await db().inventoryProduct.create({ data: { name: prefix, categoryId: category.id } });
    stock = (await db().plainTshirtStock.create({ data: { inventoryProductId: family.id, color: "Blue", colorSlug: "blue", size: "M", quantity: 2 } })).id;
  });
  beforeEach(async () => {
    auth.mockResolvedValue({ user: { id: "sales-admin", email: "admin@example.test", role: "ADMIN" } }); invalidateSalesReports();
    await db().salesRefund.deleteMany({ where: { orderId: { startsWith: prefix } } }); await db().paymentEvent.deleteMany({ where: { orderId: { startsWith: prefix } } }); await db().order.deleteMany({ where: { id: { startsWith: prefix } } });
    const online = await db().order.create({ data: { ...base("online"), webNumber: id("WEB"), items: { create: { productId: product, name: "Report Tote", sku: "REPORT-TOTE", size: "M", price: 1000, quantity: 2, unitCostCents: 40000, salesListPriceCents: 120000, salesProductKey: product, salesCategoryKey: prefix, salesCategoryName: "Bags" } }, adjustments: { create: { label: "Coupon", amount: -100 } } }, include: { items: true } }); itemId = online.items[0].id;
    await db().order.create({ data: { ...base("pos"), posNumber: id("POS"), salesChannel: "POS", paymentMethod: "CASH", total: 500, subtotal: 500, shippingCost: 0, createdAt: at, items: { create: { productId: product, name: "Report Tote", sku: "REPORT-SECOND", size: "L", price: 500, quantity: 1, unitCostCents: 20000, salesListPriceCents: 50000, salesProductKey: product, salesCategoryKey: prefix, salesCategoryName: "Bags" } } } });
    await db().order.create({ data: { ...base("pending"), createdAt: at, salesPaidAt: null, paymentStatus: "COD_PENDING", paymentMethod: "COD", status: "CONFIRMED", total: 1000, subtotal: 1000, shippingCost: 0 } });
    await db().order.create({ data: { ...base("cancelled"), createdAt: at, status: "CANCELLED", total: 1000, subtotal: 1000, shippingCost: 0, items: { create: { name: "Cancelled item", size: "M", price: 1000, quantity: 1, unitCostCents: 40000, salesListPriceCents: 100000 } } } });
  });
  afterAll(async () => {
    await db().salesRefund.deleteMany({ where: { orderId: { startsWith: prefix } } });
    await db().paymentEvent.deleteMany({ where: { orderId: { startsWith: prefix } } });
    await db().order.deleteMany({ where: { id: { startsWith: prefix } } });
    await db().$disconnect();
  });
  it("combines channels once by payment date and never counts repeated payment evidence as another order", async () => {
    await db().paymentEvent.createMany({ data: [1, 2].map(index => ({ eventKey: randomUUID(), orderId: id("online"), provider: "PAYHERE", outcome: "PAID", result: index === 1 ? "success" : "already_processed" })) });
    const result = await readSalesReport(query);
    expect(result.totals).toMatchObject({ orders: 2, revenueCents: 275000, netSalesCents: 240000, discountCents: 50000, profitCents: 140000 });
    expect(result.status).toMatchObject({ placed: 2, pending: 1, pendingCents: 100000, cancelled: 1, deliveredPaid: 2 });
    expect(result.channels.find(row => row.key === "POS")!.revenueCents).toBe(50000); expect(result.lowStock.some(row => row.name.includes("Blue"))).toBe(true);
    expect((await readSalesReport({ ...query, channel: "POS" })).totals.orders).toBe(1);
  });
  it("records one verified refund for concurrent/repeated requests, with no stock or payment mutations", async () => {
    const payload = input(), before = await db().plainTshirtStock.findUniqueOrThrow({ where: { id: stock } });
    const results = await Promise.all([recordSalesRefund(id("online"), payload), recordSalesRefund(id("online"), payload)]);
    expect(results.some(result => result.success)).toBe(true); expect((await recordSalesRefund(id("online"), payload)).success).toBe(true);
    expect(await db().salesRefund.count({ where: { orderId: id("online"), voidedAt: null } })).toBe(1);
    const report = await readSalesReport(query); expect(report.totals).toMatchObject({ revenueCents: 215000, netSalesCents: 190000, refundCents: 60000, recoveredCostCents: 40000, profitCents: 130000 });
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: stock } })).quantity).toBe(before.quantity);
    expect(await db().order.findUniqueOrThrow({ where: { id: id("online") } })).toMatchObject({ paymentStatus: "PAID", status: "DELIVERED", total: 2250, hasSalesRefunds: true });
    expect((await recordSalesRefund(id("online"), input({ reference: " ref-1 " }))).success).toBe(false);
    expect((await recordSalesRefund(id("online"), input({ reference: "OVER", items: [{ orderItemId: itemId, amountCents: 150000, returnedQuantity: 0 }], shippingCents: 0 }))).success).toBe(false);
  });
  it("prevents concurrent different refunds from exceeding the remaining paid value", async () => {
    const payload = input({ shippingCents: 0, items: [{ orderItemId: itemId, amountCents: 150000, returnedQuantity: 0 }] });
    const results = await Promise.all([
      recordSalesRefund(id("online"), { ...payload, reference: "CONCURRENT-A" }),
      recordSalesRefund(id("online"), { ...payload, reference: "CONCURRENT-B", operationKey: randomUUID() }),
    ]);
    expect(results.filter(result => result.success)).toHaveLength(1);
    expect((await db().salesRefund.aggregate({ where: { orderId: id("online"), voidedAt: null }, _sum: { merchandiseCents: true } }))._sum.merchandiseCents).toBe(150000);
    expect((await readSalesReport(query)).totals.refundCents).toBe(150000);
  });
  it("voids reporting records with an audit trail and permits a corrected active refund reference", async () => {
    expect((await recordSalesRefund(id("online"), input())).success).toBe(true);
    const saved = await db().salesRefund.findFirstOrThrow({ where: { orderId: id("online") } });
    expect((await voidSalesRefund(id("online"), saved.id, "Wrong amount recorded")).success).toBe(true); expect((await voidSalesRefund(id("online"), saved.id, "Retry void")).success).toBe(true);
    expect((await readSalesReport(query)).totals.revenueCents).toBe(275000);
    expect((await recordSalesRefund(id("online"), input({ items: [{ orderItemId: itemId, amountCents: 10000, returnedQuantity: 0 }], shippingCents: 0 }))).success).toBe(true);
    expect(await db().salesRefund.count({ where: { orderId: id("online") } })).toBe(2);
    expect((await readSalesReport(query)).totals.refundCents).toBe(10000);
    expect(await db().orderNote.count({ where: { orderId: id("online"), body: { contains: "voided" } } })).toBe(1);
  });
  it("records cancelled-order refunds separately without reducing excluded sales twice", async () => {
    const item = await db().orderItem.findFirstOrThrow({ where: { orderId: id("cancelled") } });
    expect((await recordSalesRefund(id("cancelled"), input({ items: [{ orderItemId: item.id, amountCents: 10000, returnedQuantity: 0 }], shippingCents: 0 }))).success).toBe(true);
    expect((await readSalesReport(query)).totals).toMatchObject({ revenueCents: 275000, refundCents: 10000, cancelledRefundCents: 10000, profitCents: 140000 });
  });
  it("makes missing historical costs explicit and corrects both sale and return costs without changing stock", async () => {
    await db().orderItem.update({ where: { id: itemId }, data: { unitCostCents: null } });
    expect((await readSalesReport(query)).totals.profitCents).toBeNull();
    expect((await recordSalesRefund(id("online"), input())).success).toBe(true);
    expect((await setHistoricalCosts(id("online"), [{ itemId, unitCostCents: 40000 }])).success).toBe(true);
    expect((await readSalesReport(query)).totals.profitCents).toBe(130000);
    expect((await db().salesRefundItem.findFirstOrThrow({ where: { orderItemId: itemId } })).unitCostCents).toBe(40000);
    expect((await db().plainTshirtStock.findUniqueOrThrow({ where: { id: stock } })).quantity).toBe(2);
    expect((await setHistoricalCosts(id("online"), [{ itemId: "other-order-item", unitCostCents: 0 }])).success).toBe(false);
  });
  it("requires admin authorization before recording or correcting financial metadata", async () => {
    auth.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(recordSalesRefund(id("online"), input())).rejects.toThrow("NEXT_REDIRECT");
    await expect(setHistoricalCosts(id("online"), [{ itemId, unitCostCents: 0 }])).rejects.toThrow("NEXT_REDIRECT");
    expect(await db().salesRefund.count({ where: { orderId: id("online") } })).toBe(0);
  });
  it("rejects an oversized paid range before loading its items", async () => {
    for (let start = 0; start < 5000; start += 500) await db().order.createMany({ data: Array.from({ length: 500 }, (_, index) => ({ ...base(`limit-${start + index}`), total: 1, subtotal: 1, shippingCost: 0 })) });
    await expect(readSalesReport(query)).rejects.toBeInstanceOf(SalesRangeError);
  }, 30000);
});
