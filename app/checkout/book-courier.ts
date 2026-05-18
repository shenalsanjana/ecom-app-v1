// app/checkout/book-courier.ts
import { prisma } from "@/app/_lib/prisma";
import {
  createCurfoxOrder,
  CurfoxError,
} from "@/app/_lib/courier/curfox-client";
import {
  resolveCurfoxCity,
  getDistrictForCity,
} from "@/app/_lib/courier/city-map";
import {
  sendDispatchNotificationEmail,
  sendAdminFailureAlertEmail,
  logMailerError,
} from "@/app/_lib/mailer";
import type { OrderDetails } from "@/app/_lib/mailer";

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
    logMailerError(
      "admin-failure-alert",
      { orderId: params.orderId, rbNumber: params.order.rbNumber },
      err,
    );
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
    logMailerError(
      "dispatch",
      { orderId: order.orderId, rbNumber: order.rbNumber },
      err,
    );
  }
}

/**
 * Books a courier shipment for the order and emails the dispatch notification
 * with the airwaybill PDF attached. Never throws — every failure is contained
 * and emits an admin alert via sendAdminFailureAlertEmail.
 * Returns the waybillNumber (string) on success.
 */
export async function bookCourierAndNotify(params: {
  order: OrderDetails;
}): Promise<string | undefined> {
  const { order } = params;

  // Resolve city ID or names
  const cityResolution = await resolveCurfoxCity(order.shippingAddress.city);
  const district = getDistrictForCity(order.shippingAddress.city, "");

  const orderItem: any = {
    order_no: order.orderId,
    customer_name: order.customerName,
    customer_address: buildAddressLine(order.shippingAddress),
    customer_phone: order.customerPhone?.replace(/\+/g, "") ?? "", // Remove + if present
    customer_email: order.customerEmail ?? null,
    weight: DEFAULT_WEIGHT(),
    cod: order.paymentMethod === "COD" ? order.total : 0,
    description: buildDescription(order.items),
  };

  if (cityResolution?.destinationCityId) {
      orderItem.destination_city_id = cityResolution.destinationCityId;
  } else {
      orderItem.destination_city_name = order.shippingAddress.city;
      orderItem.destination_state_name = district;
  }

  // ⑥–⑧ Create order at Curfox ────────────────────────────────────────
  let waybillNumber: string;
  try {
    waybillNumber = await createCurfoxOrder({
      general_data: {
        merchant_business_id: MERCHANT_BUSINESS_ID(),
        origin_city_id: ORIGIN_CITY_ID(),
        origin_warehouse_id: ORIGIN_WAREHOUSE_ID(),
      },
      order_data: [orderItem],
    });
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
    return undefined;
  }

  // ⑨ Persist waybill ─────────────────────────────────────────────────
  try {
    await prisma.order.update({
      where: { id: order.orderId },
      data: {
        courierWaybillNumber: waybillNumber,
        courierBookedAt: new Date(),
        trackingCode: waybillNumber,
        royalExpressSubmitted: true,
        courierLastError: null,
        courierLastErrorAt: null,
      },
    });
  } catch (err) {
    console.error("[curfox] WAYBILL LOST", {
      orderId: order.orderId,
      waybillNumber: waybillNumber,
    });
    await tryAlert({
      orderId: order.orderId,
      step: "curfox-persist",
      reason: err instanceof Error ? err.message : String(err),
      order,
      context: { waybillNumber: waybillNumber },
    });
    return waybillNumber; // Still return it as we have it
  }

  // ⑩ Send dispatch notification ─────────────────────────────────────
  // Curfox does not expose a server-side PDF endpoint; the waybill renders
  // client-side inside the merchant portal. The dispatch email links to
  // the portal so the merchant prints from there. (See docs/spec/admin-email-overhaul.md
  // for the broader rationale and the previously-attempted PDF probe history.)
  await tryDispatchEmail(order, waybillNumber, undefined);

  return waybillNumber;
}
