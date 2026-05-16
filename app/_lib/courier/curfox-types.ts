import { z } from "zod";

export const CurfoxLoginResponseSchema = z.object({
  token: z.string()
});

export const CurfoxOrderResponseSchema = z.object({
  message: z.string(),
  data: z.array(z.string()) // Array of waybill numbers
});

export const CurfoxCreateOrderInputSchema = z.object({
  general_data: z.object({
    merchant_business_id: z.number(),
    origin_city_id: z.number(),
    origin_warehouse_id: z.number().optional()
  }),
  order_data: z.array(z.object({
    order_no: z.string(),
    customer_name: z.string(),
    customer_address: z.string(),
    customer_phone: z.string(),
    weight: z.number(),
    cod: z.number(),
    description: z.string(),
    destination_city_name: z.string(),
    remark: z.string().optional()
  }))
});

export type CurfoxCreateOrderInput = z.infer<typeof CurfoxCreateOrderInputSchema>;
