import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ products: vi.fn(), promotions: vi.fn() }));
vi.mock("@/app/_lib/products", () => ({ getProducts: mock.products }));
vi.mock("@/app/_lib/storefront-promotion-service", () => ({ getStorefrontPromotions: mock.promotions }));
vi.mock("@/app/_components/home/product-card", () => ({ ProductCard: () => null }));
vi.mock("@/app/_components/home/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/app/_components/home/site-footer", () => ({ SiteFooter: () => null }));
import DealsPage from "../page";
import { ProductCard } from "@/app/_components/home/product-card";
import type { ProductView } from "@/app/_lib/products";
import type { StorefrontPromotion } from "@/app/_lib/storefront-promotions";
const product = (id: string, price: number, originalPrice: number | null = null): ProductView => {
  const value = { id, name: id, rating: 4, reviewCount: 1, category: "tees", collectionSlugs: ["tees"], departmentName: "Tees", departmentSlug: "tees", defaultColorSlug: "white", variants: [{ id: id + "-v", price, originalPrice, color: "White", colorSlug: "white", swatchHex: null, sizes: ["M"], cardImages: [] }] };
  return value;
};
const promotion: StorefrontPromotion = { id: "offer", name: "Store event", code: null, type: "PERCENTAGE", scope: "STORE", value: 1250, minimumOrder: 0, maximumDiscount: null, startsAt: null, expiresAt: null, limited: false, products: [], categories: [] };
function collect(node: unknown): { type: unknown; props: Record<string, unknown> }[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(collect);
  const el = node as { type: unknown; props?: Record<string, unknown> };
  return el.props ? [{ type: el.type, props: el.props }, ...collect(el.props.children)] : [];
}
async function cards(sort = "price_asc") { return collect(await DealsPage({ searchParams: Promise.resolve({ sort }) })).filter(e => e.type === ProductCard).map(e => e.props.product as ProductView); }
beforeEach(() => { vi.resetAllMocks(); mock.products.mockResolvedValue([product("regular", 2000), product("sale", 1500, 2000), product("not-sale", 1000, 1000)]); mock.promotions.mockResolvedValue({ offers: [], asOf: Date.parse("2026-10-21T16:00:00Z") }); });
describe("sale and offer catalogue", () => {
  it("includes genuine catalogue reductions without counting unchanged original prices", async () => {
    expect((await cards()).map(p => p.id)).toEqual(["sale"]);
  });
  it("includes eligible automatic offers and sorts by the displayed price", async () => {
    mock.promotions.mockResolvedValue({ offers: [promotion], asOf: Date.now() });
    expect((await cards()).map(p => p.id)).toEqual(["not-sale", "sale", "regular"]);
    expect((await cards("discount")).map(p => p.id)).toEqual(["sale", "regular", "not-sale"]);
  });
  it("includes conditional public offers without requiring a fabricated reduced price", async () => {
    mock.promotions.mockResolvedValue({ offers: [{ ...promotion, code: "SAVE", minimumOrder: 500000 }], asOf: Date.now() });
    expect(await cards()).toHaveLength(3);
  });
  it("excludes expired offers and unrelated targets", async () => {
    mock.promotions.mockResolvedValue({ offers: [{ ...promotion, expiresAt: "2026-10-20T00:00:00Z" }, { ...promotion, scope: "PRODUCTS", products: [{ productId: "other" }] }], asOf: Date.now() });
    expect((await cards()).map(p => p.id)).toEqual(["sale"]);
  });
});
