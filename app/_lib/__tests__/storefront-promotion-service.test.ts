import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rules: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/app/_lib/prisma", () => ({ prisma: { discount: { findMany: mock.rules } } }));
import { readStorefrontPromotions } from "../storefront-promotion-service";
import { GET } from "@/app/api/promotions/route";
beforeEach(() => { vi.resetAllMocks(); mock.rules.mockResolvedValue([]); });
describe("public promotion endpoint", () => {
  it("only queries automatic offers and explicitly public coupons", async () => {
    expect((await readStorefrontPromotions()).offers).toEqual([]);
    expect(mock.rules).toHaveBeenCalledWith(expect.objectContaining({ where: { active: true, OR: [{ code: null }, { publicOffer: true }] } }));
  });
  it("never lets intermediary caches keep an exhausted or expired campaign", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ offers: [], asOf: expect.any(Number) });
  });
  it("fails closed without exposing database errors to shoppers", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    mock.rules.mockRejectedValue(new Error("private database details"));
    try {
      const response = await GET();
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ offers: [] });
    } finally { errorLog.mockRestore(); }
  });
});
