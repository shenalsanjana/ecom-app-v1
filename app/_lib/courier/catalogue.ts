// app/_lib/courier/catalogue.ts
//
// Single source of truth for the Curfox (Royal Express) serviceable-city
// catalogue. Generated from the operator-provided live states+cities export
// (2026-06-16) and committed as curfox-cities.json so the checkout city list
// and the booking-time city-id resolution both draw from the SAME data — no
// live API call, no drift between the dropdown and what Curfox can actually
// deliver to.
//
// To refresh: re-run `npm run curfox:seed -- --export` against a fresh API
// pull (see scripts/seed-curfox-cities.ts) and replace curfox-cities.json.

import catalogueJson from "./curfox-cities.json";

export type CurfoxCatalogueCity = {
  id: number;
  name: string;
  district: string;
  zoneId: number | null;
  warehouseId: number | null;
};

type CatalogueFile = {
  meta: { generatedFrom: string; districts: string[]; cityCount: number };
  cities: CurfoxCatalogueCity[];
};

const DATA = catalogueJson as CatalogueFile;

export const CURFOX_CATALOGUE: ReadonlyArray<CurfoxCatalogueCity> = DATA.cities;
export const CURFOX_CATALOGUE_META = DATA.meta;

/**
 * Maps a customer-facing / legacy city label to the canonical spelling used in
 * the Curfox catalogue. Keys are lowercased. Extend this as the seed coverage
 * report surfaces dropdown labels that don't match a catalogue name.
 */
export const CURFOX_CITY_ALIASES: Readonly<Record<string, string>> = {
  "mt. lavinia": "mount lavinia",
  "mt lavinia": "mount lavinia",
};

/** Lowercased, trimmed, alias-applied lookup key for a city name. */
export function normalizeCityName(name: string): string {
  const t = name.trim().toLowerCase();
  return CURFOX_CITY_ALIASES[t] ?? t;
}

const BY_NAME = new Map<string, CurfoxCatalogueCity>();
for (const c of CURFOX_CATALOGUE) {
  const key = c.name.toLowerCase();
  // First occurrence wins on the (rare) duplicate city name across districts.
  if (!BY_NAME.has(key)) BY_NAME.set(key, c);
}

/** Resolve a city name (alias-aware) to its catalogue entry, or undefined. */
export function findCatalogueCity(name: string): CurfoxCatalogueCity | undefined {
  return BY_NAME.get(normalizeCityName(name));
}

export type CityGroup = { district: string; cities: string[] };

let groupedCache: CityGroup[] | null = null;

/**
 * Catalogue grouped by district, each district's cities sorted A→Z and the
 * districts themselves sorted A→Z. Shape is intentionally slim (names only)
 * so the checkout client bundle stays small.
 */
export function catalogueByDistrict(): CityGroup[] {
  if (groupedCache) return groupedCache;
  const m = new Map<string, string[]>();
  for (const c of CURFOX_CATALOGUE) {
    const list = m.get(c.district) ?? [];
    list.push(c.name);
    m.set(c.district, list);
  }
  groupedCache = [...m.entries()]
    .map(([district, cities]) => ({
      district,
      cities: [...new Set(cities)].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.district.localeCompare(b.district));
  return groupedCache;
}
