import { prisma } from "@/app/_lib/prisma";

export async function listPlainTshirtStock() {
  return prisma.plainTshirtStock.findMany({ orderBy: [{ colorSlug: "asc" }, { size: "asc" }] });
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
