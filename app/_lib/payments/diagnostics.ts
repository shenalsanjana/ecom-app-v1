// app/_lib/payments/diagnostics.ts
// Read-only provider/system diagnostics for the admin Settings page.
// HARD CONSTRAINT: returns presence/mode booleans only — NEVER key material.
import { envFlag } from "./config";

export type PaymentDiagnostic = {
  method: "COD" | "PAYHERE" | "KOKO" | "MINTPAY";
  label: string;
  enabled: boolean;
  mode: "test" | "live" | null; // null for COD (no provider mode)
  configured: boolean; // required env keys present — never the keys themselves
};

function providerMode(envName: string): "test" | "live" {
  return process.env[envName]?.trim().toLowerCase() === "live" ? "live" : "test";
}

function hasAll(...names: string[]): boolean {
  return names.every((n) => Boolean(process.env[n]));
}

export function getPaymentDiagnostics(): PaymentDiagnostic[] {
  return [
    { method: "COD", label: "Cash on Delivery", enabled: true, mode: null, configured: true },
    {
      method: "PAYHERE",
      label: "Credit / Debit Card (PayHere)",
      enabled: true,
      mode: providerMode("PAYHERE_MODE"),
      configured: hasAll("PAYHERE_MERCHANT_ID", "PAYHERE_MERCHANT_SECRET"),
    },
    {
      method: "KOKO",
      label: "Koko — Pay in 3",
      enabled: envFlag("KOKO_ENABLED"),
      mode: providerMode("KOKO_MODE"),
      configured: hasAll("KOKO_MERCHANT_ID", "KOKO_API_KEY", "KOKO_PRIVATE_KEY"),
    },
    {
      method: "MINTPAY",
      label: "Mintpay",
      enabled: envFlag("MINTPAY_ENABLED"),
      mode: providerMode("MINTPAY_MODE"),
      configured: hasAll("MINTPAY_MERCHANT_ID", "MINTPAY_MERCHANT_SECRET"),
    },
  ];
}

export type SystemDiagnostics = {
  nodeEnv: string;
  appUrl: string;
  providers: { method: string; mode: "test" | "live" | null; configured: boolean }[];
};

export function getSystemDiagnostics(): SystemDiagnostics {
  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
    providers: getPaymentDiagnostics().map(({ method, mode, configured }) => ({ method, mode, configured })),
  };
}
