// app/_lib/courier/city-map.ts
import { prisma as defaultPrisma } from "@/app/_lib/prisma";

type PrismaLike = typeof defaultPrisma;
let prismaImpl: PrismaLike = defaultPrisma;

export const __test_only_setPrisma = (p: PrismaLike): void => {
  prismaImpl = p;
};

/**
 * Cities and their Curfox IDs confirmed via API probing.
 */
export const KNOWN_CURFOX_CITIES: ReadonlyArray<{
  name: string;
  id: number | null;
  state?: string;
  defaultWarehouseId?: number | null;
}> = [
  { name: "Ampara", id: 78, state: "Ampara", defaultWarehouseId: 2 },
  { name: "Colombo 08", id: 1788, state: "Colombo", defaultWarehouseId: 61 },
  { name: "Dankotuwa", id: 2649, state: "Puttalam", defaultWarehouseId: 49 },
  { name: "Dekatana", id: 2684, state: "Gampaha", defaultWarehouseId: 80 },
  { name: "Dunkannawa", id: 2651, state: "Puttalam", defaultWarehouseId: 49 },
  { name: "Induruwa", id: 20, state: "Galle", defaultWarehouseId: 1 },
  { name: "Kadawatha", id: 972, state: "Gampaha", defaultWarehouseId: 21 },
  { name: "Kandy", id: 1148, state: "Kandy", defaultWarehouseId: 25 },
  { name: "Kottawa", id: 1519, state: "Colombo", defaultWarehouseId: 53 },
  { name: "Kotte", id: 1500, state: "Colombo", defaultWarehouseId: 78 },
  { name: "Kurunegala", id: 1649, state: "Kurunegala", defaultWarehouseId: 30 },
  { name: "Malabe", id: 1007, state: "Colombo", defaultWarehouseId: 22 },
  { name: "Naththandiya", id: 2666, state: "Puttalam", defaultWarehouseId: 49 },
  { name: "Rajagiriya", id: 1802, state: "Colombo", defaultWarehouseId: 61 },
  { name: "Ettampitiya", id: 419, state: "Badulla", defaultWarehouseId: 7 },
  // Name-only entries (fallback to name-based routing)
  { name: "Colombo 01", id: null, state: "Colombo" },
  { name: "Colombo 02", id: null, state: "Colombo" },
  { name: "Colombo 03", id: null, state: "Colombo" },
  { name: "Colombo 04", id: null, state: "Colombo" },
  { name: "Colombo 05", id: null, state: "Colombo" },
  { name: "Colombo 06", id: null, state: "Colombo" },
  { name: "Colombo 07", id: null, state: "Colombo" },
  { name: "Colombo 09", id: null, state: "Colombo" },
  { name: "Colombo 10", id: null, state: "Colombo" },
  { name: "Colombo 11", id: null, state: "Colombo" },
  { name: "Colombo 12", id: null, state: "Colombo" },
  { name: "Colombo 13", id: null, state: "Colombo" },
  { name: "Colombo 14", id: null, state: "Colombo" },
  { name: "Colombo 15", id: null, state: "Colombo" },
  { name: "Galle", id: null, state: "Galle" },
  { name: "Negombo", id: null, state: "Gampaha" },
  { name: "Wattala", id: null, state: "Gampaha" },
];

const KNOWN_LOOKUP = new Map(KNOWN_CURFOX_CITIES.map((c) => [c.name.toLowerCase(), c]));

export function isKnownCurfoxCityName(cityName: string): boolean {
  return KNOWN_LOOKUP.has(cityName.trim().toLowerCase());
}

export function canonicalizeCurfoxCityName(cityName: string): string {
  const hit = KNOWN_LOOKUP.get(cityName.trim().toLowerCase());
  return hit?.name ?? cityName.trim();
}

export function getDistrictForCity(cityName: string, region: string): string {
    const trimmed = cityName.trim();
    const hit = KNOWN_LOOKUP.get(trimmed.toLowerCase());
    if (hit?.state) return hit.state;

    // Bare base names like "Colombo" don't have a KNOWN_LOOKUP row of their own
    // (the seed only contains "Colombo 01..15"), so fall through to a
    // prefix match against the seeded entries. Every "Colombo NN" entry
    // shares the same state ("Colombo"), so the first hit is authoritative.
    if (trimmed) {
        const prefix = trimmed.toLowerCase() + " ";
        for (const c of KNOWN_CURFOX_CITIES) {
            if (c.state && c.name.toLowerCase().startsWith(prefix)) {
                return c.state;
            }
        }
    }

    // Heuristic fallbacks for common regions
    const r = region.toLowerCase();
    if (r.includes("westren") || r.includes("western")) {
        if (cityName.toLowerCase().includes("colombo")) return "Colombo";
    }

    return region;
}

export async function resolveCurfoxCity(
  cityName: string,
): Promise<{ destinationCityId: number; destinationWarehouseId: number | null } | null> {
  const trimmed = cityName.trim();
  if (!trimmed) return null;
  
  // Try DB first
  const row = await prismaImpl.curfoxCity.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
  });
  if (row) {
    return {
      destinationCityId: row.id,
      destinationWarehouseId: row.defaultWarehouseId,
    };
  }
  
  // Fallback to hardcoded list
  const hit = KNOWN_LOOKUP.get(trimmed.toLowerCase());
  if (hit && hit.id) {
      return {
          destinationCityId: hit.id,
          destinationWarehouseId: hit.defaultWarehouseId ?? null
      };
  }
  
  return null;
}

export async function listAvailableCities(): Promise<Array<{ id: number; name: string }>> {
  let dbRows: Array<{ id: number; name: string }> = [];
  try {
    dbRows = await prismaImpl.curfoxCity.findMany({
      select: { id: true, name: true },
    });
  } catch (err) {
    console.error("[curfox] listAvailableCities DB read failed", err);
  }
  
  const dbNames = new Set(dbRows.map((r) => r.name.toLowerCase()));
  const nameOnly = KNOWN_CURFOX_CITIES.filter(
    (c) => c.id === null && !dbNames.has(c.name.toLowerCase()),
  ).map((c, idx) => ({ id: -(idx + 1), name: c.name }));
  
  return [...dbRows, ...nameOnly].sort((a, b) => a.name.localeCompare(b.name));
}
