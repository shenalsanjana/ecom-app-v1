import { z } from "zod";

/** Canonical Sri Lankan phone = E.164 "+94" + 9-digit subscriber.
 *  Accepts 0771234567 / +94771234567 / 94771234567 / 771234567 (with any
 *  spaces, hyphens, parens). Assumes LK subscriber numbers never begin "94". */
export function canonicalizeLkPhone(raw: string): string {
  const digits = raw.replace(/[\s()-]/g, "").replace(/^\+/, "");
  const local = digits.replace(/^94/, "").replace(/^0/, "");
  return `+94${local}`;
}

/** Classify a login/reset identifier. Email path preserves the existing
 *  trim-only normalization (emails are stored case-as-typed in this repo). */
export function resolveIdentifier(
  raw: string,
): { kind: "phone"; value: string } | { kind: "email"; value: string } {
  const trimmed = raw.trim();
  if (trimmed.includes("@")) return { kind: "email", value: trimmed };
  return { kind: "phone", value: canonicalizeLkPhone(trimmed) };
}

/** Mobile-only (subscriber begins 7) — landlines can't receive an OTP SMS. */
export const LkMobileSchema = z
  .string()
  .trim()
  .min(1, "Phone is required")
  .transform((v) => canonicalizeLkPhone(v))
  .refine((v) => /^\+947\d{8}$/.test(v), "Enter a valid Sri Lankan mobile number (e.g. 0771234567)");
