// app/_lib/courier/curfox-types.ts
import { z } from "zod";

// ── inbound: login response (3 observed shapes) ──────────────────────────
export const CurfoxLoginResponseSchema = z.union([
  z.object({ token: z.string().min(1) }).passthrough(),
  z.object({ access_token: z.string().min(1) }).passthrough(),
  z.object({ data: z.object({ token: z.string().min(1) }).passthrough() }).passthrough(),
]);

// ── inbound: create-order response (matches sample data) ─────────────────
export const CurfoxOrderResponseSchema = z.object({
  data: z.object({
    id: z.number().int(),
    waybill_number: z.string().min(1),
    order_no: z.string(),
    customer_name: z.string(),
    cod: z.number(),
    delivery_charge: z.number().nullable().optional(),
    order_current_status: z
      .object({ key: z.string(), name: z.string() })
      .passthrough()
      .optional(),
  }).passthrough(),
});

// ── inbound: city list ──────────────────────────────────────────────────
export const CurfoxCitySchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  default_warehouse_id: z.number().int().nullable().optional(),
}).passthrough();

export const CurfoxCityListResponseSchema = z.object({
  data: z.array(CurfoxCitySchema),
}).passthrough();

// ── outbound: create-order payload ──────────────────────────────────────
export const CurfoxCreateOrderInputSchema = z.object({
  order_no: z.string().min(1),
  customer_name: z.string().min(1).max(100),
  customer_address: z.string().min(1).max(500),
  customer_phone: z.string().min(10),
  customer_secondary_phone: z.string().nullable().optional(),
  customer_email: z.string().email().nullable().optional(),
  weight: z.number().positive(),
  origin_city_id: z.number().int().positive(),
  origin_warehouse_id: z.number().int().positive(),
  destination_city_id: z.number().int().positive(),
  destination_warehouse_id: z.number().int().positive().nullable().optional(),
  cod: z.number().nonnegative(),
  description: z.string().min(1).max(200),
  // TODO(curfox-verify): field name may be `note` / `merchant_remark` instead
  remark: z.string().max(500).nullable().optional(),
});

// ── inferred types ──────────────────────────────────────────────────────
export type CurfoxCreateOrderInput = z.infer<typeof CurfoxCreateOrderInputSchema>;
export type CurfoxCreatedOrder = z.infer<typeof CurfoxOrderResponseSchema>["data"];
export type CurfoxCity = z.infer<typeof CurfoxCitySchema>;
