import { describe, it, expect } from "vitest";
import {
  DELIVERY_CITIES,
  zoneForCity,
  type DeliveryZone,
} from "@/app/_lib/delivery-zones";

describe("delivery-zones catalogue", () => {
  it("has at least one Colombo-zone and one Other-zone city", () => {
    const zones = new Set(DELIVERY_CITIES.map((c) => c.zone));
    expect(zones.has("COLOMBO")).toBe(true);
    expect(zones.has("OTHER")).toBe(true);
  });

  it("has no duplicate names (case-insensitive)", () => {
    const seen = new Set<string>();
    for (const c of DELIVERY_CITIES) {
      const key = c.name.trim().toLowerCase();
      expect(seen.has(key), `duplicate city: ${c.name}`).toBe(false);
      seen.add(key);
    }
  });
});

describe("zoneForCity", () => {
  it("returns COLOMBO for a Colombo-zone city", () => {
    expect(zoneForCity("Colombo")).toBe<DeliveryZone>("COLOMBO");
    expect(zoneForCity("Dehiwala")).toBe<DeliveryZone>("COLOMBO");
  });

  it("returns OTHER for a non-Colombo city", () => {
    expect(zoneForCity("Kandy")).toBe<DeliveryZone>("OTHER");
    expect(zoneForCity("Galle")).toBe<DeliveryZone>("OTHER");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(zoneForCity("  colombo  ")).toBe<DeliveryZone>("COLOMBO");
    expect(zoneForCity("DEHIWALA")).toBe<DeliveryZone>("COLOMBO");
  });

  it("defaults to OTHER for an unknown city", () => {
    expect(zoneForCity("Atlantis")).toBe<DeliveryZone>("OTHER");
    expect(zoneForCity("")).toBe<DeliveryZone>("OTHER");
  });
});
