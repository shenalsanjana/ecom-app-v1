import { describe, it, expect } from "vitest";
import {
  findCatalogueCity,
  normalizeCityName,
  catalogueByDistrict,
  CURFOX_CATALOGUE,
} from "../catalogue";

describe("Curfox catalogue", () => {
  it("loads the committed catalogue with unique ids", () => {
    expect(CURFOX_CATALOGUE.length).toBeGreaterThan(1500);
    const ids = new Set(CURFOX_CATALOGUE.map((c) => c.id));
    expect(ids.size).toBe(CURFOX_CATALOGUE.length);
  });

  it("resolves a known city to its real Curfox id", () => {
    expect(findCatalogueCity("Kotte")?.id).toBe(1500);
    expect(findCatalogueCity("Dehiwala")?.id).toBe(1491);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(findCatalogueCity("  kOtTe ")?.id).toBe(1500);
  });

  it("resolves an alias spelling to the canonical city", () => {
    expect(normalizeCityName("Mt. Lavinia")).toBe("mount lavinia");
    expect(findCatalogueCity("Mt. Lavinia")?.id).toBe(1503);
    expect(findCatalogueCity("Mount Lavinia")?.id).toBe(1503);
  });

  it("returns undefined for a district Royal Express does not service", () => {
    for (const absent of ["Kandy", "Jaffna", "Ampara", "Trincomalee"]) {
      expect(findCatalogueCity(absent)).toBeUndefined();
    }
  });


  it("exposes every supported city once for checkout and Shop POS", () => {
    const cities = catalogueByDistrict().flatMap(group => group.cities);
    const keys = cities.map(normalizeCityName);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(keys)).toEqual(new Set(CURFOX_CATALOGUE.map(city => normalizeCityName(city.name))));
    expect(cities.filter(city => city === "Soranathota")).toHaveLength(1);
    for (const city of cities) expect(findCatalogueCity(city)).toBeDefined();
  });

  it("groups cities by district, sorted, with no empty groups", () => {
    const groups = catalogueByDistrict();
    expect(groups.length).toBe(15);
    for (const g of groups) {
      expect(g.cities.length).toBeGreaterThan(0);
      const sorted = [...g.cities].sort((a, b) => a.localeCompare(b));
      expect(g.cities).toEqual(sorted);
    }
    // districts themselves sorted
    const districts = groups.map((g) => g.district);
    expect(districts).toEqual([...districts].sort((a, b) => a.localeCompare(b)));
  });
});
