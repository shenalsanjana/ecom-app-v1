// app/checkout/book-courier.ts
import { prisma } from "@/app/_lib/prisma";
import {
  createCurfoxOrder,
  fetchCurfoxWaybillPdf,
  CurfoxError,
} from "@/app/_lib/courier/curfox-client";
import {
  resolveCurfoxCity,
  isKnownCurfoxCityName,
  canonicalizeCurfoxCityName,
} from "@/app/_lib/courier/city-map";
import {
  sendDispatchNotificationEmail,
  sendAdminFailureAlertEmail,
} from "@/app/_lib/mailer";
import type { OrderDetails } from "@/app/_lib/mailer";
import type { CurfoxOrderDataItem } from "@/app/_lib/courier/curfox-types";

const MERCHANT_BUSINESS_ID = (): number =>
  Number(process.env.CURFOX_MERCHANT_BUSINESS_ID ?? "7290");
const ORIGIN_CITY_ID = (): number =>
  Number(process.env.CURFOX_ORIGIN_CITY_ID ?? "1500");
const ORIGIN_WAREHOUSE_ID = (): number =>
  Number(process.env.CURFOX_ORIGIN_WAREHOUSE_ID ?? "78");
const DEFAULT_WEIGHT = (): number =>
  Number(process.env.CURFOX_DEFAULT_WEIGHT_KG ?? "1");

function buildAddressLine(addr: OrderDetails["shippingAddress"]): string {
  const parts = [addr.line1];
  if (addr.line2) parts.push(addr.line2);
  parts.push(addr.postalCode);
  return parts.join(", ");
}

function buildDescription(items: OrderDetails["items"]): string {
  if (items.length === 1) return items[0].name;
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  return `Clothes (${totalQty} items)`;
}

async function tryAlert(params: Parameters<typeof sendAdminFailureAlertEmail>[0]): Promise<void> {
  try {
    await sendAdminFailureAlertEmail(params);
  } catch (err) {
    console.error("[mailer] admin alert send failed (suppressed):", err);
  }
}

async function tryDispatchEmail(
  order: OrderDetails,
  waybillNumber: string,
  pdfBuffer: Buffer | undefined,
): Promise<void> {
  try {
    await sendDispatchNotificationEmail({ order, waybillNumber, pdfBuffer });
    await prisma.order
      .update({
        where: { id: order.orderId },
        data: { dispatchEmailSentAt: new Date() },
      })
      .catch((err) => {
        console.error("[checkout] dispatchEmailSentAt update failed:", err);
      });
  } catch (err) {
    console.error("[mailer] dispatch send failed:", err);
  }
}

/**
 * Resolve destination fields for the order envelope. Two tiers:
 *   1. DB lookup → use destination_city_id (best — Curfox doesn't need state)
 *   2. Known-name fallback → use destination_city_name + caller-supplied region
 *      (Curfox accepts the name but requires destination_state_name too)
 * Returns null when the city is neither in the DB nor in the known list,
 * which signals the orchestrator to fail with a city-lookup admin alert.
 */
async function resolveDestination(
  shipping: OrderDetails["shippingAddress"],
): Promise<Pick<
  CurfoxOrderDataItem,
  "destination_city_id" | "destination_city_name" | "destination_state_name"
> | null> {
  const rawCity = shipping.city;
  const dbHit = await resolveCurfoxCity(rawCity);
  if (dbHit && dbHit.destinationCityId > 0) {
    return { destination_city_id: dbHit.destinationCityId };
  }
  if (isKnownCurfoxCityName(rawCity)) {
    return {
      destination_city_name: canonicalizeCurfoxCityName(rawCity),
      destination_state_name: shipping.region,
    };
  }
  return null;
}

/**
 * Books a courier shipment for the order and emails the dispatch notification
 * with the airwaybill PDF attached. Never throws — every failure is contained
 * and emits an admin alert via sendAdminFailureAlertEmail.
 */
export async function bookCourierAndNotify(params: { order: OrderDetails }): Promise<void> {
  const { order } = params;

  // ⑤ Resolve city ─────────────────────────────────────────────────────
  let destination: Pick<
    CurfoxOrderDataItem,
    "destination_city_id" | "destination_city_name" | "destination_state_name"
  >;
  try {
    const resolved = await resolveDestination(order.shippingAddress);
    if (!resolved) {
      console.warn("[curfox] city-lookup failed", {
        orderId: order.orderId,
        city: order.shippingAddress.city,
      });
      await prisma.order
        .update({
          where: { id: order.orderId },
          data: {
            courierLastError: `city not in map: ${order.shippingAddress.city}`,
            courierLastErrorAt: new Date(),
          },
        })
        .catch(() => undefined);
      await tryAlert({
        orderId: order.orderId,
        step: "city-lookup",
        reason: `City "${order.shippingAddress.city}" is not in the Curfox city map`,
        order,
        context: { city: order.shippingAddress.city },
      });
      return;
    }
    destination = resolved;
  } catch (err) {
    console.error("[curfox] city-lookup error", err);
    await tryAlert({
      orderId: order.orderId,
      step: "city-lookup",
      reason: err instanceof Error ? err.message : String(err),
      order,
      context: { city: order.shippingAddress.city },
    });
    return;
  }

  // ⑥–⑧ Create order at Curfox ────────────────────────────────────────
  let curfoxOrder: { waybill_number: string };
  try {
    const created = await createCurfoxOrder({
      general_data: {
        merchant_business_id: MERCHANT_BUSINESS_ID(),
        origin_city_id: ORIGIN_CITY_ID(),
        origin_warehouse_id: ORIGIN_WAREHOUSE_ID(),
      },
      order_data: [
        {
          order_no: order.orderId,
          customer_name: order.customerName,
          customer_address: buildAddressLine(order.shippingAddress),
          customer_phone: order.customerPhone ?? "",
          customer_email: order.customerEmail ?? null,
          weight: DEFAULT_WEIGHT(),
          cod: order.paymentMethod === "COD" ? order.total : 0,
          description: buildDescription(order.items),
          ...destination,
        },
      ],
    });
    curfoxOrder = { waybill_number: created.waybill_number };
  } catch (err) {
    const isCurfoxErr = err instanceof CurfoxError;
    const reason =
      isCurfoxErr && err.status
        ? `Curfox HTTP ${err.status}`
        : err instanceof Error
          ? err.message
          : String(err);
    const detail = isCurfoxErr ? err.responseBody : err instanceof Error ? err.stack : undefined;
    const step: "curfox-login" | "curfox-create" =
      isCurfoxErr && err.step === "login" ? "curfox-login" : "curfox-create";
    await prisma.order
      .update({
        where: { id: order.orderId },
        data: {
          courierLastError: `${step}: ${reason}`,
          courierLastErrorAt: new Date(),
        },
      })
      .catch(() => undefined);
    await tryAlert({ orderId: order.orderId, step, reason, errorDetail: detail, order });
    return;
  }

  // ⑨ Persist waybill ─────────────────────────────────────────────────
  try {
    await prisma.order.update({
      where: { id: order.orderId },
      data: {
        courierWaybillNumber: curfoxOrder.waybill_number,
        courierBookedAt: new Date(),
        trackingCode: curfoxOrder.waybill_number,
        royalExpressSubmitted: true,
        courierLastError: null,
        courierLastErrorAt: null,
      },
    });
  } catch (err) {
    console.error("[curfox] WAYBILL LOST", {
      orderId: order.orderId,
      waybillNumber: curfoxOrder.waybill_number,
    });
    await tryAlert({
      orderId: order.orderId,
      step: "curfox-persist",
      reason: err instanceof Error ? err.message : String(err),
      order,
      context: { waybillNumber: curfoxOrder.waybill_number },
    });
    return;
  }

  // ⑩ Fetch PDF ───────────────────────────────────────────────────────
  let pdfBuffer: Buffer | undefined;
  try {
    pdfBuffer = await fetchCurfoxWaybillPdf(curfoxOrder.waybill_number);
    await prisma.order
      .update({
        where: { id: order.orderId },
        data: { dispatchPdfFetchedAt: new Date() },
      })
      .catch((err) => {
        console.error("[checkout] dispatchPdfFetchedAt update failed:", err);
      });
  } catch (err) {
    pdfBuffer = undefined;
    console.warn("[curfox] pdf-fetch failed", {
      orderId: order.orderId,
      waybillNumber: curfoxOrder.waybill_number,
      reason: err instanceof Error ? err.message : String(err),
    });
    await prisma.order
      .update({
        where: { id: order.orderId },
        data: {
          courierLastError: `pdf-fetch: ${err instanceof Error ? err.message : String(err)}`,
          courierLastErrorAt: new Date(),
        },
      })
      .catch(() => undefined);
    await tryAlert({
      orderId: order.orderId,
      step: "curfox-pdf",
      reason: err instanceof Error ? err.message : String(err),
      order,
      context: { waybillNumber: curfoxOrder.waybill_number },
    });
    // Fall through — dispatch email still sends without attachment
  }

  // ⑪ Send dispatch notification (always — with or without PDF) ───────
  await tryDispatchEmail(order, curfoxOrder.waybill_number, pdfBuffer);
}
