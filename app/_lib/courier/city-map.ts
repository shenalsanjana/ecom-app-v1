// app/_lib/courier/city-map.ts
import { prisma as defaultPrisma } from "@/app/_lib/prisma";
import { listCurfoxCities as defaultListCurfoxCities } from "./curfox-client";

// Dependency-injection seams (test-only). The default exports above are used
// in production; tests inject their own implementations via these setters.
type PrismaLike = typeof defaultPrisma;
type CurfoxClientLike = { listCurfoxCities: typeof defaultListCurfoxCities };

let prismaImpl: PrismaLike = defaultPrisma;
let curfoxImpl: CurfoxClientLike = { listCurfoxCities: defaultListCurfoxCities };

export const __test_only_setPrisma = (p: PrismaLike): void => {
  prismaImpl = p;
};
export const __test_only_setCurfoxClient = (c: CurfoxClientLike): void => {
  curfoxImpl = c;
};

export async function resolveCurfoxCity(
  cityName: string,
): Promise<{ destinationCityId: number; destinationWarehouseId: number | null } | null> {
  const trimmed = cityName.trim();
  if (!trimmed) return null;
  const row = await prismaImpl.curfoxCity.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
  });
  if (!row) return null;
  return {
    destinationCityId: row.id,
    destinationWarehouseId: row.defaultWarehouseId,
  };
}

export async function refreshCurfoxCityMap(): Promise<{ count: number }> {
  const fetched = await curfoxImpl.listCurfoxCities();
  await prismaImpl.$transaction(async (tx) => {
    await tx.curfoxCity.deleteMany({});
    await tx.curfoxCity.createMany({
      data: fetched.map((c) => ({
        id: c.id,
        name: c.name,
        defaultWarehouseId: c.default_warehouse_id ?? null,
      })),
    });
  });
  return { count: fetched.length };
}

export async function listAvailableCities(): Promise<Array<{ id: number; name: string }>> {
  const rows = await prismaImpl.curfoxCity.findMany({
    select: { id: true, name: true },
  });
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
