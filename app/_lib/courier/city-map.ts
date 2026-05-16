// app/_lib/courier/city-map.ts
//
// Two layers of city resolution:
//
//   1. `resolveCurfoxCity(name)` — DB-backed lookup in `CurfoxCity`. Returns
//      the numeric Curfox city id and (optionally) the default warehouse id
//      so the order envelope can use `destination_city_id` directly.
//
//   2. `isKnownCurfoxCityName(name)` — string-only check against the list of
//      city names verified during the 2026-05-16 staging probe. Lets the
//      orchestrator fall back to `destination_city_name` when the DB has no
//      numeric id (we only have IDs for the two cities that appeared in the
//      sample order data — Curfox does not publish a cities endpoint, so the
//      remaining names below were confirmed via 422 validation responses).
//
// Both lookups are case-insensitive and trim leading/trailing whitespace so
// "  kotte ", "Kotte", and "KOTTE" all resolve identically.

import { prisma as defaultPrisma } from "@/app/_lib/prisma";
import { listCurfoxCities as defaultListCurfoxCities } from "./curfox-client";

// Dependency-injection seams (test-only). Production uses the imports above.
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

/**
 * Cities Curfox accepts as `destination_city_name` per the live staging probe.
 * Names with `id !== null` also have a confirmed numeric Curfox city id and
 * default warehouse — those get seeded into `CurfoxCity` and resolve to ids
 * via `resolveCurfoxCity`. The id-less entries still validate via
 * `isKnownCurfoxCityName` so the orchestrator can send the raw name.
 *
 * Add to this list (and re-run `seedKnownCurfoxCities()`) once more names
 * are confirmed via the Curfox merchant portal's network traffic.
 */
export const KNOWN_CURFOX_CITIES: ReadonlyArray<{
  name: string;
  id: number | null;
  defaultWarehouseId: number | null;
}> = [
  // Confirmed ids — appeared in the GET /api/merchant/order sample data
  { name: "Kotte", id: 1500, defaultWarehouseId: 78 },
  { name: "Ettampitiya", id: 419, defaultWarehouseId: 7 },
  // Name-only entries — accepted by Curfox's 422 validator but their ids
  // weren't observable from any public endpoint
  { name: "Colombo 01", id: null, defaultWarehouseId: null },
  { name: "Colombo 03", id: null, defaultWarehouseId: null },
  { name: "Kandy", id: null, defaultWarehouseId: null },
  { name: "Galle", id: null, defaultWarehouseId: null },
];

const KNOWN_LOOKUP = new Map(KNOWN_CURFOX_CITIES.map((c) => [c.name.toLowerCase(), c]));

/**
 * True if the (case-insensitive, trimmed) city name appears in
 * `KNOWN_CURFOX_CITIES`. Use when no DB id is available but you still want
 * to gate which raw names are forwarded to Curfox.
 */
export function isKnownCurfoxCityName(cityName: string): boolean {
  return KNOWN_LOOKUP.has(cityName.trim().toLowerCase());
}

/**
 * Canonicalizes the city name to the form Curfox accepts ("Kotte" not "kotte",
 * "Colombo 01" not "COLOMBO 01"). Returns the original input trimmed if the
 * name isn't in the known list.
 */
export function canonicalizeCurfoxCityName(cityName: string): string {
  const hit = KNOWN_LOOKUP.get(cityName.trim().toLowerCase());
  return hit?.name ?? cityName.trim();
}

/**
 * Look up a city in the `CurfoxCity` DB table by name (case-insensitive).
 * Returns the numeric Curfox ids if a row exists, or null if the city has
 * not been seeded.
 */
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

/**
 * Wipe + repopulate `CurfoxCity` from the live Curfox API. The probe did not
 * find a working cities endpoint, so this will currently throw — the admin
 * route should fall back to `seedKnownCurfoxCities()` (below) until Curfox
 * exposes a cities listing.
 */
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

/**
 * Seed `CurfoxCity` from the locally-known list. Only entries with a real
 * Curfox id are persisted — name-only entries can still be validated via
 * `isKnownCurfoxCityName` without a DB row.
 */
export async function seedKnownCurfoxCities(): Promise<{ count: number }> {
  const withIds = KNOWN_CURFOX_CITIES.filter(
    (c): c is { name: string; id: number; defaultWarehouseId: number | null } => c.id !== null,
  );
  await prismaImpl.$transaction(async (tx) => {
    await tx.curfoxCity.deleteMany({});
    await tx.curfoxCity.createMany({
      data: withIds.map((c) => ({
        id: c.id,
        name: c.name,
        defaultWarehouseId: c.defaultWarehouseId,
      })),
    });
  });
  return { count: withIds.length };
}

/**
 * Cities surfaced to the checkout dropdown — the union of DB-seeded rows and
 * the name-only entries from `KNOWN_CURFOX_CITIES`. DB rows win on conflict
 * so a later refresh that supplies a real id overrides the name-only stub.
 */
export async function listAvailableCities(): Promise<Array<{ id: number; name: string }>> {
  let dbRows: Array<{ id: number; name: string }> = [];
  try {
    dbRows = await prismaImpl.curfoxCity.findMany({ select: { id: true, name: true } });
  } catch (err) {
    console.error("[curfox] listAvailableCities DB read failed; falling back to known list:", err);
  }
  const dbNames = new Set(dbRows.map((r) => r.name.toLowerCase()));
  // Synthesize negative ids for name-only entries so React keys stay unique
  // — book-courier never sends a negative id to Curfox; it falls back to
  // `destination_city_name` whenever the resolved id is missing or non-positive.
  const nameOnly = KNOWN_CURFOX_CITIES.filter(
    (c) => c.id === null && !dbNames.has(c.name.toLowerCase()),
  ).map((c, idx) => ({ id: -(idx + 1), name: c.name }));
  return [...dbRows, ...nameOnly].sort((a, b) => a.name.localeCompare(b.name));
}
