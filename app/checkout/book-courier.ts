// app/checkout/book-courier.ts
import { prisma } from "@/app/_lib/prisma";
import {
  createCurfoxOrder,
  CurfoxError,
} from "@/app/_lib/courier/curfox-client";
import type { CurfoxOrderDataItem } from "@/app/_lib/courier/curfox-types";
import {
  resolveCurfoxCity,
  getDistrictForCity,
} from "@/app/_lib/courier/city-map";
import {
  sendDispatchNotificationEmail,
  sendCustomerDispatchEmail,
  sendAdminFailureAlertEmail,
  logMailerError,
} from "@/app/_lib/mailer";
import type { OrderDetails } from "@/app/_lib/mailer";
import { shouldEmailCustomer } from "@/app/_lib/mailer-guard";
import { DELIVERY_COMPANY_NAME } from "@/app/_lib/carrier";
import { orderReference } from "@/app/_lib/order-reference";

const MERCHANT_BUSINESS_ID = (): number =>
  Number(process.env.CURFOX_MERCHANT_BUSINESS_ID ?? "7290");
const ORIGIN_CITY_ID = (): number =>
  Number(process.env.CURFOX_ORIGIN_CITY_ID ?? "1500");
const ORIGIN_WAREHOUSE_ID = (): number =>
  Number(process.env.CURFOX_ORIGIN_WAREHOUSE_ID ?? "78");
const DEFAULT_WEIGHT = (): number =>
  Number(process.env.CURFOX_DEFAULT_WEIGHT_KG ?? "1");

function buildAddressLine(addr: OrderDetails["shippingAddress"]): string {
  return [addr.line1, addr.line2, addr.city].filter(Boolean).join(", ");
}

function buildDescription(items: OrderDetails["items"]): string {
  if (items.length === 1) return items[0].name;
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  return `Clothes (${totalQty} items)`;
}

/**
 * Normalises a phone number for the Curfox/Sri Lanka local format.
 * Couriers expect the leading `0` form (e.g., 0770000000), not the
 * international `+94` form. Inputs may include spaces, dashes, or a
 * leading `+`; output is digits-only with a leading `0`.
 */
function toLocalSriLankaPhone(phone: string | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("94")) return "0" + digits.slice(2);
  if (digits.startsWith("0")) return digits;
  return digits;
}

async function tryAlert(params: Parameters<typeof sendAdminFailureAlertEmail>[0]): Promise<void> {
  try {
    await sendAdminFailureAlertEmail(params);
  } catch (err) {
    logMailerError(
      "admin-failure-alert",
      { orderId: params.orderId, webNumber: params.order.webNumber, rbNumber: params.order.rbNumber },
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
      { orderId: order.orderId, webNumber: order.webNumber, rbNumber: order.rbNumber },
      err,
    );
  }
}

/**
 * Sends the customer-facing dispatch email (Royal Express + tracking number)
 * once the order is booked, then stamps customerDispatchEmailSentAt. Never
 * throws — a send/DB failure is logged but must not undo the dispatch.
 */
async function trySendCustomerDispatchEmail(
  order: OrderDetails,
  waybillNumber: string,
): Promise<void> {
  if (!shouldEmailCustomer(order.customerEmail)) {
    console.log(`[checkout] order ${order.orderId}: no customer email — dispatch email skipped`);
    return;
  }
  try {
    await sendCustomerDispatchEmail({ ...order, trackingCode: waybillNumber });
    await prisma.order
      .update({
        where: { id: order.orderId },
        data: { customerDispatchEmailSentAt: new Date() },
      })
      .catch((err) => {
        console.error("[checkout] customerDispatchEmailSentAt update failed:", err);
      });
  } catch (err) {
    logMailerError(
      "dispatch",
      { orderId: order.orderId, webNumber: order.webNumber, rbNumber: order.rbNumber },
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
  const district = getDistrictForCity(order.shippingAddress.city, "").trim();

  // Without a city ID and without a non-empty district, the Curfox refine
  // would reject the payload with a path-misleading "destination_city_id"
  // error. Short-circuit with an actionable admin alert instead.
  if (!cityResolution?.destinationCityId && !district) {
    const reason = `Unmapped Curfox city: "${order.shippingAddress.city}"`;
    await prisma.order
      .update({
        where: { id: order.orderId },
        data: { courierLastError: `city-lookup: ${reason}`, courierLastErrorAt: new Date() },
      })
      .catch(() => undefined);
    await tryAlert({
      orderId: order.orderId,
      step: "city-lookup",
      reason,
      order,
      context: { city: order.shippingAddress.city },
    });
    return undefined;
  }

  const orderItem: CurfoxOrderDataItem = {
    order_no: orderReference(order),
    customer_name: order.customerName,
    customer_address: buildAddressLine(order.shippingAddress),
    customer_phone: toLocalSriLankaPhone(order.customerPhone),
    customer_email: order.customerEmail ?? null,
    weight: DEFAULT_WEIGHT(),
    cod: order.paymentMethod === "COD" ? order.total : 0,
    description: buildDescription(order.items),
    remark: order.notes?.trim() || undefined,
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
        status: "DISPATCHED",
        deliveryCompany: DELIVERY_COMPANY_NAME,
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
  await trySendCustomerDispatchEmail(order, waybillNumber);

  return waybillNumber;
}
