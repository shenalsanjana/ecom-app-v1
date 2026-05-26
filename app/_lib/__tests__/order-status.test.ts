import { describe, it, expect } from "vitest";
import {
  PAYMENT_STATUSES,
  initialPaymentStatus,
  paymentStatusLabel,
  type PaymentStatus,
} from "@/app/_lib/order-status";
import * as orderStatus from "@/app/_lib/order-status";

describe("PAYMENT_STATUSES", () => {
  it("lists the four canonical values", () => {
    expect([...PAYMENT_STATUSES]).toEqual([
      "PENDING",
      "PAID",
      "COD_PENDING",
      "COD_COLLECTED",
    ]);
  });
});

describe("initialPaymentStatus", () => {
  it("returns COD_PENDING for COD", () => {
    expect(initialPaymentStatus("COD")).toBe<PaymentStatus>("COD_PENDING");
  });

  it("returns PENDING for each online provider", () => {
    expect(initialPaymentStatus("PAYHERE")).toBe<PaymentStatus>("PENDING");
    expect(initialPaymentStatus("KOKO")).toBe<PaymentStatus>("PENDING");
    expect(initialPaymentStatus("MINITPAY")).toBe<PaymentStatus>("PENDING");
  });

  it("defaults to PENDING for an unknown method", () => {
    expect(initialPaymentStatus("UNKNOWN_PROVIDER")).toBe<PaymentStatus>("PENDING");
  });
});

describe("paymentStatusLabel", () => {
  it("returns the customer-facing label for each status", () => {
    expect(paymentStatusLabel("PENDING")).toBe("Awaiting payment");
    expect(paymentStatusLabel("PAID")).toBe("Paid");
    expect(paymentStatusLabel("COD_PENDING")).toBe("Cash on delivery");
    expect(paymentStatusLabel("COD_COLLECTED")).toBe("Paid");
  });

  it("returns null for null, undefined, and unknown values", () => {
    expect(paymentStatusLabel(null)).toBeNull();
    expect(paymentStatusLabel(undefined)).toBeNull();
    expect(paymentStatusLabel("WHATEVER")).toBeNull();
  });
});

describe("checkout payment state", () => {
  it("does not trust a URL status alone for PayHere payment confirmation", () => {
    const stateFn = (
      orderStatus as typeof orderStatus & {
        checkoutPaymentState?: (args: {
          paymentMethod: string;
          paymentStatus: string | null;
          urlStatus?: string;
        }) => { isPaid: boolean; isCancelled: boolean };
      }
    ).checkoutPaymentState;

    expect(typeof stateFn).toBe("function");
    if (typeof stateFn !== "function") return;

    expect(
      stateFn({
        paymentMethod: "PAYHERE",
        paymentStatus: "PENDING",
        urlStatus: "COMPLETED",
      }),
    ).toMatchObject({ isPaid: false, isCancelled: false });

    expect(
      stateFn({
        paymentMethod: "PAYHERE",
        paymentStatus: "PAID",
        urlStatus: undefined,
      }),
    ).toMatchObject({ isPaid: true, isCancelled: false });

    expect(
      stateFn({
        paymentMethod: "PAYHERE",
        paymentStatus: "PENDING",
        urlStatus: "cancelled",
      }),
    ).toMatchObject({ isPaid: false, isCancelled: true });
  });
});
