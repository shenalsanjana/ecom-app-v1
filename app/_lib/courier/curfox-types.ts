// app/_lib/courier/curfox-types.ts
//
// Schemas mirror the Curfox v2-operations API exactly as proven by the
// 2026-05-16 staging probe (see Validation log in the design spec). The
// create-order wire format is a two-key envelope — `general_data` plus an
// `order_data` array — and the success response is { message, data: [<waybill>] }.
import { z } from "zod";

// ── inbound: login response (3 observed shapes) ────────────────────────────
export const CurfoxLoginResponseSchema = z.union([
  z.object({ token: z.string().min(1) }).passthrough(),
  z.object({ access_token: z.string().min(1) }).passthrough(),
  z.object({ data: z.object({ token: z.string().min(1) }).passthrough() }).passthrough(),
]);

// ── outbound: create-order envelope ────────────────────────────────────────
// Both general_data and order_data[<i>] are flat objects (no arrays, no
// further nesting). The shape was reverse-engineered from Curfox's 422
// validation responses against the live endpoint /api/merchant/order/single.

export const CurfoxGeneralDataSchema = z.object({
  merchant_business_id: z.number().int().positive(),
  origin_city_id: z.number().int().positive(),
  origin_warehouse_id: z.number().int().positive(),
});

export const CurfoxOrderDataItemSchema = z
  .object({
    order_no: z.string().min(1),
    customer_name: z.string().min(1).max(100),
    customer_address: z.string().min(1).max(500),
    customer_phone: z.string().min(10),
    customer_secondary_phone: z.string().nullable().optional(),
    customer_email: z.string().email().nullable().optional(),
    weight: z.number().positive(),
    // Destination is provided as EITHER an id OR a name+state pair. Curfox
    // rejects payloads with neither ("A destination city name is required if
    // a destination city id is not provided").
    destination_city_id: z.number().int().positive().optional(),
    destination_city_name: z.string().min(1).optional(),
    destination_state_name: z.string().min(1).optional(),
    cod: z.number().nonnegative(),
    description: z.string().min(1).max(200),
    // TODO(curfox-verify): field name unconfirmed; Curfox may use `note` or
    // `merchant_remark`. Optional today so omitting it cannot break a booking.
    remark: z.string().max(500).nullable().optional(),
  })
  .refine(
    (d) => d.destination_city_id !== undefined || d.destination_city_name !== undefined,
    {
      message: "destination_city_id or destination_city_name is required",
      path: ["destination_city_id"],
    },
  );

export const CurfoxCreateOrderInputSchema = z.object({
  general_data: CurfoxGeneralDataSchema,
  order_data: z.array(CurfoxOrderDataItemSchema).min(1),
});

// ── inbound: create-order response ─────────────────────────────────────────
// Confirmed shape from staging probe (waybill RA03872055):
//   { "message": "Orders Created Successfully", "data": ["RA03872055"] }
// Note: the response does NOT include the numeric Curfox order id —
// downstream consumers must work from the waybill string alone.
export const CurfoxOrderResponseSchema = z
  .object({
    message: z.string(),
    data: z.array(z.string().min(1)).min(1),
  })
  .passthrough();

// ── inbound: city list (probe found NO working endpoint; schema kept for
// the optional admin refresh route and tests, but the live API does not
// expose this endpoint at any of the 18 probed paths) ──────────────────────
export const CurfoxCitySchema = z
  .object({
    id: z.number().int(),
    name: z.string().min(1),
    default_warehouse_id: z.number().int().nullable().optional(),
  })
  .passthrough();

export const CurfoxCityListResponseSchema = z
  .object({ data: z.array(CurfoxCitySchema) })
  .passthrough();

// ── inferred types ─────────────────────────────────────────────────────────
export type CurfoxGeneralData = z.infer<typeof CurfoxGeneralDataSchema>;
export type CurfoxOrderDataItem = z.infer<typeof CurfoxOrderDataItemSchema>;
export type CurfoxCreateOrderInput = z.infer<typeof CurfoxCreateOrderInputSchema>;
export type CurfoxCity = z.infer<typeof CurfoxCitySchema>;

// What createCurfoxOrder returns to callers. We synthesize this object from
// the first element of the response's `data` array since callers downstream
// (book-courier, mailer) only need the waybill string.
export type CurfoxCreatedOrder = { waybill_number: string };
