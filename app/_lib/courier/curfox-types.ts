import { z } from "zod";

export const CurfoxLoginResponseSchema = z.union([
  z.object({ token: z.string().min(1) }),
  z.object({ access_token: z.string().min(1) }),
  z.object({ data: z.object({ token: z.string().min(1) }) })
]);

export const CurfoxOrderResponseSchema = z.object({
  message: z.string(),
  data: z.array(z.string()).nonempty() // Array of waybill numbers
});

export const CurfoxGeneralDataSchema = z.object({
  merchant_business_id: z.number(),
  origin_city_id: z.number(),
  origin_warehouse_id: z.number().optional()
});

export const CurfoxOrderDataItemSchema = z.object({
  order_no: z.string(),
  customer_name: z.string(),
  customer_address: z.string(),
  customer_phone: z.string(),
  customer_secondary_phone: z.string().optional().nullable(),
  customer_email: z.string().email().optional().nullable(),
  weight: z.number().positive(),
  cod: z.number().min(0),
  description: z.string(),
  destination_city_id: z.number().optional(),
  destination_city_name: z.string().optional(),
  destination_state_name: z.string().optional(),
  remark: z.string().optional()
}).refine(data => data.destination_city_id || (data.destination_city_name && data.destination_state_name), {
  message: "Either destination_city_id or both destination_city_name and destination_state_name must be provided",
  path: ["destination_city_id"]
});

export const CurfoxCreateOrderInputSchema = z.object({
  general_data: CurfoxGeneralDataSchema,
  order_data: z.array(CurfoxOrderDataItemSchema).nonempty()
});

export type CurfoxCreateOrderInput = z.infer<typeof CurfoxCreateOrderInputSchema>;
export type CurfoxOrderDataItem = z.infer<typeof CurfoxOrderDataItemSchema>;
export type CurfoxGeneralData = z.infer<typeof CurfoxGeneralDataSchema>;
