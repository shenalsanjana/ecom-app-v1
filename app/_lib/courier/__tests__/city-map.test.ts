import { describe, it, expect, vi } from "vitest";
import {
  resolveCurfoxCity,
  refreshCurfoxCityMap,
  listAvailableCities,
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

describe("listAvailableCities", () => {
  it("returns id+name sorted by name", async () => {
    __test_only_setPrisma(
      makePrismaMock([
        { id: 419, name: "Ettampitiya", defaultWarehouseId: 7 },
        { id: 1500, name: "Kotte", defaultWarehouseId: 78 },
      ]) as unknown as never,
    );
    const out = await listAvailableCities();
    expect(out.map((c) => c.name)).toEqual(["Ettampitiya", "Kotte"]);
  });
});
