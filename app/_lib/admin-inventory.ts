import { prisma } from "@/app/_lib/prisma";
import { groupInventoryStock } from "@/app/_lib/inventory-groups";
import { inventorySection } from "@/app/_lib/inventory-structure";

export async function listPlainTshirtStock() {
  return prisma.plainTshirtStock.findMany({ orderBy: [{ colorSlug: "asc" }, { size: "asc" }] });
}

export async function listInventoryHierarchy() {
  const categories = await prisma.inventoryCategory.findMany({ orderBy: { name: "asc" } });
  const products = await prisma.inventoryProduct.findMany({
    orderBy: { name: "asc" },
    include: {
      designs: {
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, archived: true, status: true, dtfDesignId: true, stockMode: true,
          dtfDesign: { select: { id: true, name: true, quantity: true, version: true } },
          variants: {
            where: { archived: false }, orderBy: { sortOrder: "asc" },
            select: { id: true, color: true, colorSlug: true, sku: true, sizeStocks: { where: { archived: false }, select: { size: true, sku: true, plainTshirtStockId: true } } },
          },
        },
      },
    },
  });
  const stock = await listPlainTshirtStock();
  const unassignedProducts = await prisma.product.findMany({
    where: { inventoryProductId: null }, select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  return { categories, products, stock, unassignedProducts };
}

export async function listInventoryParents() {
  const categories = await prisma.inventoryCategory.findMany();
  const parents = await prisma.inventoryProduct.findMany({ orderBy: { name: "asc" }, include: { category: { select: { name: true } } } });
  return parents.map(parent => ({ ...parent, section: inventorySection(categories, parent.categoryId) }));
}

export async function listInventoryStockGroups() {
  const stock = await listPlainTshirtStock();
  const variants = await prisma.productVariant.findMany({
    orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
    select: {
      archived: true, color: true, colorSlug: true, sizeStocks: { where: { archived: false }, select: { size: true, sku: true, plainTshirtStockId: true } },
      product: {
        select: {
          id: true, name: true, archived: true, inventoryProductId: true,
          department: { select: { slug: true, slugHistory: { select: { oldSlug: true } } } },
        },
      },
    },
  });
  return groupInventoryStock(stock, variants);
}

export async function listDtfDesigns() {
  const [designs, counts] = await Promise.all([
    prisma.dtfDesign.findMany({ orderBy: { name: "asc" } }),
    prisma.product.groupBy({
      by: ["dtfDesignId"],
      where: { dtfDesignId: { not: null }, archived: false },
      _count: { _all: true },
    }),
  ]);
  const countMap = new Map(counts.map((c) => [c.dtfDesignId as string, c._count._all]));
  return designs.map((d) => ({ ...d, productCount: countMap.get(d.id) ?? 0 }));
}
