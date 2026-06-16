import { describe, it, expect } from "vitest";
import { getDistrictForCity } from "../city-map";

describe("getDistrictForCity", () => {
  it("returns the catalogue district for an exact city match", () => {
    expect(getDistrictForCity("Kotte", "")).toBe("Colombo");
    expect(getDistrictForCity("Dehiwala", "")).toBe("Colombo");
    expect(getDistrictForCity("Galle", "")).toBe("Galle");
  });

  it("returns the district for an alias spelling (Mt. Lavinia -> Mount Lavinia)", () => {
    expect(getDistrictForCity("Mt. Lavinia", "")).toBe("Colombo");
  });

  it("returns empty string for a district Royal Express does not service (Kandy)", () => {
    // Kandy is absent from the live Curfox catalogue; treat as unroutable.
    expect(getDistrictForCity("Kandy", "")).toBe("");
  });

  it("resolves bare 'Colombo' via prefix match to the 'Colombo' district", () => {
    // Bug fix: KNOWN_CURFOX_CITIES contains "Colombo 01..15" / "Colombo 08"
    // but not bare "Colombo". Without prefix-match the function returned an
    // empty string, which silently failed the Curfox refine check.
    expect(getDistrictForCity("Colombo", "")).toBe("Colombo");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(getDistrictForCity("  colombo  ", "")).toBe("Colombo");
    expect(getDistrictForCity("KOTTE", "")).toBe("Colombo");
  });

  it("returns empty string for an unmapped city when no region hint is given", () => {
    // Caller is responsible for treating an empty result as 'unroutable'
    // and short-circuiting before the Curfox payload is built.
    expect(getDistrictForCity("Trincomalee", "")).toBe("");
  });

  it("uses the western-province heuristic when region is supplied", () => {
    expect(getDistrictForCity("Colombo Fort", "Western")).toBe("Colombo");
  });
});
