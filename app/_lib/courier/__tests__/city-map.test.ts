import { describe, it, expect, vi } from "vitest";
import {
  resolveCurfoxCity,
  refreshCurfoxCityMap,
  listAvailableCities,
  isKnownCurfoxCityName,
  canonicalizeCurfoxCityName,
  seedKnownCurfoxCities,
  KNOWN_CURFOX_CITIES,
  __test_only_setPrisma,
  __test_only_setCurfoxClient,
} from "../city-map";

function makePrismaMock(rows: Array<{ id: number; name: string; defaultWarehouseId: number | null }>) {
  let store = rows.slice();
  return {
    curfoxCity: {
      findFirst: vi.fn(async ({ where }: { where: { name: { equals: string; mode: string } } }) => {
        const target = where.name.equals.toLowerCase();
        return store.find((r) => r.name.toLowerCase() === target) ?? null;
      }),
      findMany: vi.fn(async () => store.slice().sort((a, b) => a.name.localeCompare(b.name))),
      deleteMany: vi.fn(async () => {
        const c = store.length;
        store = [];
        return { count: c };
      }),
      createMany: vi.fn(async ({ data }: { data: Array<{ id: number; name: string; defaultWarehouseId: number | null }> }) => {
        store.push(...data);
        return { count: data.length };
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      curfoxCity: {
        deleteMany: async () => ({ count: store.length }),
        createMany: async ({ data }: { data: Array<{ id: number; name: string; defaultWarehouseId: number | null }> }) => {
          store.length = 0;
          store.push(...data);
          return { count: data.length };
        },
      },
    })),
    __store: () => store.slice(),
  };
}

describe("resolveCurfoxCity", () => {
  it("returns the destination ids for an exact match", async () => {
    __test_only_setPrisma(makePrismaMock([{ id: 1500, name: "Kotte", defaultWarehouseId: 78 }]) as unknown as never);
    const out = await resolveCurfoxCity("Kotte");
    expect(out).toEqual({ destinationCityId: 1500, destinationWarehouseId: 78 });
  });

  it("is case-insensitive", async () => {
    __test_only_setPrisma(makePrismaMock([{ id: 1500, name: "Kotte", defaultWarehouseId: 78 }]) as unknown as never);
    const out = await resolveCurfoxCity("kotte");
    expect(out?.destinationCityId).toBe(1500);
  });

  it("trims whitespace", async () => {
    __test_only_setPrisma(makePrismaMock([{ id: 1500, name: "Kotte", defaultWarehouseId: 78 }]) as unknown as never);
    const out = await resolveCurfoxCity("  Kotte  ");
    expect(out?.destinationCityId).toBe(1500);
  });

  it("returns null on miss", async () => {
    __test_only_setPrisma(makePrismaMock([{ id: 1500, name: "Kotte", defaultWarehouseId: 78 }]) as unknown as never);
    expect(await resolveCurfoxCity("Atlantis")).toBeNull();
  });
});

describe("isKnownCurfoxCityName", () => {
  it("matches the 2026-05-16 staging-probe validated names exactly", () => {
    for (const c of KNOWN_CURFOX_CITIES) {
      expect(isKnownCurfoxCityName(c.name)).toBe(true);
    }
  });

  it("is case-insensitive and whitespace-tolerant", () => {
    expect(isKnownCurfoxCityName("kotte")).toBe(true);
    expect(isKnownCurfoxCityName("  COLOMBO 01  ")).toBe(true);
    expect(isKnownCurfoxCityName("colombo 03")).toBe(true);
  });

  it("rejects unknown names", () => {
    expect(isKnownCurfoxCityName("Atlantis")).toBe(false);
    // Plain "Colombo" is NOT accepted by Curfox — must be a numbered zone.
    expect(isKnownCurfoxCityName("Colombo")).toBe(false);
  });
});

describe("canonicalizeCurfoxCityName", () => {
  it("returns the canonical casing for known names", () => {
    expect(canonicalizeCurfoxCityName("kotte")).toBe("Kotte");
    expect(canonicalizeCurfoxCityName("  COLOMBO 01 ")).toBe("Colombo 01");
  });

  it("returns the trimmed input when the name is not known", () => {
    expect(canonicalizeCurfoxCityName("  Atlantis  ")).toBe("Atlantis");
  });
});

describe("refreshCurfoxCityMap", () => {
  it("wipes + repopulates from listCurfoxCities", async () => {
    const mock = makePrismaMock([{ id: 9999, name: "Stale", defaultWarehouseId: null }]);
    __test_only_setPrisma(mock as unknown as never);
    __test_only_setCurfoxClient({
      listCurfoxCities: async () => [
        { id: 1500, name: "Kotte", default_warehouse_id: 78 },
        { id: 419, name: "Ettampitiya", default_warehouse_id: 7 },
      ],
    });
    const out = await refreshCurfoxCityMap();
    expect(out.count).toBe(2);
    expect(mock.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("seedKnownCurfoxCities", () => {
  it("seeds only the entries with confirmed Curfox ids", async () => {
    const mock = makePrismaMock([]);
    __test_only_setPrisma(mock as unknown as never);
    const out = await seedKnownCurfoxCities();
    const idBackedCount = KNOWN_CURFOX_CITIES.filter((c) => c.id !== null).length;
    expect(out.count).toBe(idBackedCount);
    expect(idBackedCount).toBeGreaterThan(0);
    const store = mock.__store();
    expect(store.map((r) => r.name).sort()).toEqual(
      KNOWN_CURFOX_CITIES.filter((c) => c.id !== null).map((c) => c.name).sort(),
    );
  });
});

describe("listAvailableCities", () => {
  it("returns DB rows + name-only known cities sorted alphabetically", async () => {
    __test_only_setPrisma(
      makePrismaMock([
        { id: 1500, name: "Kotte", defaultWarehouseId: 78 },
        { id: 419, name: "Ettampitiya", defaultWarehouseId: 7 },
      ]) as unknown as never,
    );
    const out = await listAvailableCities();
    const names = out.map((c) => c.name);
    // Must include both DB and name-only entries
    expect(names).toContain("Kotte");
    expect(names).toContain("Ettampitiya");
    expect(names).toContain("Colombo 01");
    expect(names).toContain("Colombo 03");
    // Sorted alphabetically
    expect([...names].sort()).toEqual(names);
  });

  it("falls back to the known-only list if the DB read throws", async () => {
    __test_only_setPrisma({
      curfoxCity: {
        findMany: vi.fn(async () => {
          throw new Error("DB down");
        }),
      },
    } as unknown as never);
    const out = await listAvailableCities();
    expect(out.length).toBeGreaterThan(0);
    expect(out.map((c) => c.name)).toContain("Colombo 01");
  });
});
