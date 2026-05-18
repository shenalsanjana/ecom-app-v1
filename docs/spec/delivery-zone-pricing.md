# Delivery Zone Pricing — Spec

**Status:** Approved · 2026-05-18
**Slice:** A (of a larger checkout/payment/courier overhaul — see "Out of scope" below)

## Goal

Replace the current flat Rs.350 shipping fee with zone-based delivery pricing, simplify the address form by removing two seldom-needed fields, and align customer-facing copy with the merchant's preferred terminology.

## Why

- The merchant has confirmed two flat delivery tiers with their courier (Colombo Rs.350, rest of country Rs.450). The current flat Rs.350 under-charges every non-Colombo order.
- "Province" and "Postal Code" add friction at checkout and are not needed by the courier (the city name is what the courier dispatches against).
- "Shipping" is being retired from the customer vocabulary in favour of "Delivery" across all customer-facing surfaces.

## Scope

### In

- Two-tier delivery pricing: **Colombo Rs.350 / Other Rs.450**, with free delivery preserved when `subtotal ≥ Rs.5000` for both zones.
- City **dropdown** at checkout (and in the saved-address form) with built-in zone tagging — customer never picks the zone explicitly; it is derived from the chosen city.
- Removal of the **Province** and **Postal Code** fields from forms and from the database schema.
- Renaming customer-facing **"Shipping" → "Delivery"** throughout the UI (cart, checkout, account, order detail). Internal DB columns and identifiers (`Order.shippingCost`, `shippingLine1`, `shippingCity`, etc.) **are left as-is**.
- Vitest coverage for the new zone resolver and pricing function; one Playwright e2e flow that verifies the cart total flips correctly when the customer toggles their city between a Colombo and a non-Colombo option.

### Out (deferred)

- RoyalExpress courier integration (replaces the current Curfox courier — separate spec).
- PayHere / Koko / MintPay payment-provider integrations.
- RB-prefixed internal courier order number generator.
- Distinct tracking-ID storage (separate from waybill).
- Admin notification email field changes (recipient address, RoyalExpress number, COD amount).

## Architecture

### New module — `app/_lib/delivery-zones.ts`

The single source of truth for the city catalogue and zone classification. Kept **independent** of `app/_lib/courier/*` so that the upcoming courier swap (slice C) does not have to disturb pricing logic.

```ts
export type DeliveryZone = "COLOMBO" | "OTHER";

export type DeliveryCity = { name: string; zone: DeliveryZone };

export const DELIVERY_CITIES: ReadonlyArray<DeliveryCity> = [
  // Colombo zone (representative — final list seeded from app/_lib/courier/city-map.ts
  // with manual zone tagging during implementation; expected ~15–20 Colombo-zone entries
  // and ~50–80 Other-zone entries spanning the rest of Sri Lanka).
  { name: "Colombo",       zone: "COLOMBO" },
  { name: "Dehiwala",      zone: "COLOMBO" },
  { name: "Mt. Lavinia",   zone: "COLOMBO" },
  { name: "Nugegoda",      zone: "COLOMBO" },
  { name: "Maharagama",    zone: "COLOMBO" },
  // …
  { name: "Kandy",         zone: "OTHER" },
  { name: "Galle",         zone: "OTHER" },
  { name: "Jaffna",        zone: "OTHER" },
  // …
];

/** Returns the zone for a city name. Case- and whitespace-insensitive.
 *  Unknown city → "OTHER" (defensive: outside-Colombo is the higher-cost,
 *  merchant-safe default — under-charging is the failure mode to avoid). */
export function zoneForCity(name: string): DeliveryZone;
```

### Pricing — `app/_lib/checkout-config.ts` (rewrite)

```ts
import type { DeliveryZone } from "@/app/_lib/delivery-zones";

export const COLOMBO_DELIVERY_COST = 350;
export const OTHER_DELIVERY_COST = 450;
export const FREE_DELIVERY_THRESHOLD = 5000;

export function calculateDelivery(subtotal: number, zone: DeliveryZone): number {
  if (subtotal >= FREE_DELIVERY_THRESHOLD) return 0;
  return zone === "COLOMBO" ? COLOMBO_DELIVERY_COST : OTHER_DELIVERY_COST;
}
```

`SHIPPING_COST` and `calculateShipping` are **removed** (not deprecated — the codebase is small enough to update every caller in one diff).

### Schema migration

Migration name: `remove-province-and-postal`

```diff
 model Address {
   id          String   @id @default(cuid())
   userId      String
   label       String
   line1       String
   line2       String?
   city        String
-  region      String
-  postalCode  String
   country     String
   …
 }

 model Order {
   …
   shippingCity          String
-  shippingRegion        String
-  shippingPostalCode    String
   shippingCountry       String
   …
 }
```

The migration is **destructive**: existing values in those four columns are lost. This was the explicitly chosen strategy.

### Server-side delivery computation

`app/checkout/actions.ts` (`processOrder`) currently calls `calculateShipping(subtotal)`. New behaviour:

```ts
import { zoneForCity } from "@/app/_lib/delivery-zones";
import { calculateDelivery } from "@/app/_lib/checkout-config";

const zone = zoneForCity(form.city);
const shippingCost = calculateDelivery(subtotal, zone);
```

The `Order.shippingCost` column already exists and is reused as-is. The action no longer writes `shippingRegion` or `shippingPostalCode` (those columns are gone).

## UI changes

| File | Change |
| --- | --- |
| `app/checkout/checkout-client.tsx` | City `<input>` → `<select>` populated from `DELIVERY_CITIES`. Remove the Province row and the Postal Code row entirely. Heading "Shipping Address" → "Delivery Address". Cost-row label "Shipping" → "Delivery". The order summary's delivery line and total recompute whenever the selected city's zone changes, before the customer clicks submit. |
| `app/checkout/actions.ts` | Use `calculateDelivery(subtotal, zoneForCity(city))` instead of `calculateShipping(subtotal)`. Drop the two field writes. |
| `app/_components/cart/cart-summary.tsx` | "Shipping" line label → "Delivery". The pre-checkout cart does not know the customer's zone yet, so the cart estimate uses the Colombo rate (Rs.350) when below threshold — matches current behaviour for the median customer and avoids a misleadingly-high estimate. Final cost is settled at checkout. |
| `app/_components/cart/free-shipping-progress.tsx` | All "free shipping" copy → "free delivery". Threshold logic and styling unchanged. |
| `app/_components/account/address-form.tsx` | City `<select>`. Remove Province + Postal Code fields. |
| `app/_components/account/addresses-list.tsx` | Stop rendering Province / Postal Code lines from the saved-address card. |
| `app/account/orders/page.tsx` (and any other order-detail UI) | Stop rendering `shippingRegion` / `shippingPostalCode`. |

## Edge cases

1. **Legacy saved-address rows with a `city` that does not match any `DELIVERY_CITIES` entry** (free-text inputs collected before this change). When the customer opens the address-edit form, the dropdown defaults to a "Select a city" placeholder option that is invalid for submission — the customer must choose before save. Read-only views (addresses list, order detail) display the stored value verbatim.

2. **Cart-summary line item before the customer has reached checkout.** The cart has no zone information. The line shows the Colombo rate (Rs.350 or "Free" when above threshold). Wording: "Delivery (estimated)" so the customer is not surprised by Rs.100 added at checkout.

3. **Guest checkout.** No structural difference — the same dropdown drives both authed and guest flows.

4. **Unknown city** (e.g., from a poorly-typed legacy address, or future expansion): `zoneForCity` returns `"OTHER"`, so the merchant collects Rs.450, the higher of the two. Under-charging is treated as worse than over-charging.

## Testing

### Unit (Vitest)

- `zoneForCity`
  - Known Colombo-zone names return `"COLOMBO"`.
  - Known outside names return `"OTHER"`.
  - Unknown names return `"OTHER"`.
  - Case and surrounding whitespace are ignored.
- `calculateDelivery`
  - All four combinations of `{ zone: COLOMBO | OTHER } × { subtotal: < threshold | ≥ threshold }`.
  - Boundary at exactly `subtotal === FREE_DELIVERY_THRESHOLD` → free.

### Integration (Playwright e2e)

Extend the existing setup with one test:

- Place a logged-in checkout flow.
- Fill in address with city = "Colombo". Assert order-summary delivery line shows Rs.350 and total reflects it.
- Change the city to "Kandy" (or another non-Colombo entry). Assert the line updates to Rs.450 and the total recomputes correctly.
- Submit, follow to order-details, confirm the persisted `shippingCost` matches the displayed cost.

## Open questions

None. All branching decisions are resolved in the body above.

## Risks

- **Destructive migration**: existing Address / Order rows lose their Province and Postal Code values irreversibly. The merchant has accepted this — the data has no compliance or fulfilment value.
- **City-list completeness**: the initial seed comes from the existing Curfox city-map. If a customer's city is missing, they cannot complete checkout. Implementation should err on the side of a longer list (a few extra entries cost nothing) and the missing-city case will surface in any e2e or manual smoke pass.
- **No coupling to courier swap**: if slice C lands first and reshapes the city catalogue, this module is the source of truth for pricing and must not be merged into the courier module without re-evaluating the boundary.

## References

- Existing Curfox city map: `app/_lib/courier/city-map.ts` (seed source for the catalogue).
- Existing checkout server action: `app/checkout/actions.ts` (`processOrder` at L115).
- Existing checkout client: `app/checkout/checkout-client.tsx` (large file — keep the diff focused on the changes above; do not refactor the whole component in this slice).
- Existing Order / Address models: `prisma/schema.prisma` (L24-41, L108-147).
