// app/_lib/delivery-zones.ts
// Single source of truth for the customer-facing city dropdown at checkout
// and for the zone classification that drives delivery pricing.
//
// Independent of app/_lib/courier/* so that a future courier swap does not
// have to disturb pricing logic. The initial catalogue is seeded from the
// existing Curfox city map but tagged with zone manually.

export type DeliveryZone = "COLOMBO" | "OTHER";

export type DeliveryCity = {
  name: string;
  zone: DeliveryZone;
};

export const DELIVERY_CITIES: ReadonlyArray<DeliveryCity> = [
  // ---- Colombo zone ----
  { name: "Colombo", zone: "COLOMBO" },
  { name: "Dehiwala", zone: "COLOMBO" },
  // "Mount Lavinia" is the Curfox catalogue spelling the checkout combobox now
  // emits; "Mt. Lavinia" is kept so legacy saved addresses still price COLOMBO.
  { name: "Mount Lavinia", zone: "COLOMBO" },
  { name: "Mt. Lavinia", zone: "COLOMBO" },
  { name: "Nugegoda", zone: "COLOMBO" },
  { name: "Maharagama", zone: "COLOMBO" },
  { name: "Kotte", zone: "COLOMBO" },
  { name: "Rajagiriya", zone: "COLOMBO" },
  { name: "Battaramulla", zone: "COLOMBO" },
  { name: "Pannipitiya", zone: "COLOMBO" },
  { name: "Wattala", zone: "COLOMBO" },
  { name: "Kelaniya", zone: "COLOMBO" },
  { name: "Moratuwa", zone: "COLOMBO" },
  { name: "Ratmalana", zone: "COLOMBO" },
  { name: "Boralesgamuwa", zone: "COLOMBO" },
  { name: "Piliyandala", zone: "COLOMBO" },
  { name: "Homagama", zone: "COLOMBO" },
  { name: "Kaduwela", zone: "COLOMBO" },
  { name: "Malabe", zone: "COLOMBO" },
  { name: "Kohuwala", zone: "COLOMBO" },
  { name: "Kottawa", zone: "COLOMBO" },
  { name: "Colombo 01", zone: "COLOMBO" },
  { name: "Colombo 02", zone: "COLOMBO" },
  { name: "Colombo 03", zone: "COLOMBO" },
  { name: "Colombo 04", zone: "COLOMBO" },
  { name: "Colombo 05", zone: "COLOMBO" },
  { name: "Colombo 06", zone: "COLOMBO" },
  { name: "Colombo 07", zone: "COLOMBO" },
  { name: "Colombo 08", zone: "COLOMBO" },
  { name: "Colombo 09", zone: "COLOMBO" },
  { name: "Colombo 10", zone: "COLOMBO" },
  { name: "Colombo 11", zone: "COLOMBO" },
  { name: "Colombo 12", zone: "COLOMBO" },
  { name: "Colombo 13", zone: "COLOMBO" },
  { name: "Colombo 14", zone: "COLOMBO" },
  { name: "Colombo 15", zone: "COLOMBO" },

  // ---- Other zone (rest of country) ----
  { name: "Kandy", zone: "OTHER" },
  { name: "Galle", zone: "OTHER" },
  { name: "Matara", zone: "OTHER" },
  { name: "Jaffna", zone: "OTHER" },
  { name: "Negombo", zone: "OTHER" },
  { name: "Kurunegala", zone: "OTHER" },
  { name: "Anuradhapura", zone: "OTHER" },
  { name: "Polonnaruwa", zone: "OTHER" },
  { name: "Trincomalee", zone: "OTHER" },
  { name: "Batticaloa", zone: "OTHER" },
  { name: "Ratnapura", zone: "OTHER" },
  { name: "Badulla", zone: "OTHER" },
  { name: "Nuwara Eliya", zone: "OTHER" },
  { name: "Hambantota", zone: "OTHER" },
  { name: "Ampara", zone: "OTHER" },
  { name: "Kalutara", zone: "OTHER" },
  { name: "Gampaha", zone: "OTHER" },
  { name: "Matale", zone: "OTHER" },
  { name: "Puttalam", zone: "OTHER" },
  { name: "Vavuniya", zone: "OTHER" },
  { name: "Mannar", zone: "OTHER" },
  { name: "Kilinochchi", zone: "OTHER" },
  { name: "Mullaitivu", zone: "OTHER" },
  { name: "Chilaw", zone: "OTHER" },
  { name: "Embilipitiya", zone: "OTHER" },
];

const ZONE_BY_NAME: ReadonlyMap<string, DeliveryZone> = new Map(
  DELIVERY_CITIES.map((c) => [c.name.trim().toLowerCase(), c.zone]),
);

/**
 * Returns the delivery zone for a city name. Case- and whitespace-insensitive.
 * Unknown cities default to "OTHER" — under-charging is the failure mode we
 * want to avoid, so falling to the higher tier is the merchant-safe default.
 */
export function zoneForCity(name: string): DeliveryZone {
  return ZONE_BY_NAME.get(name.trim().toLowerCase()) ?? "OTHER";
}
