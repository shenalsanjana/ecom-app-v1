// app/_lib/free-delivery-note.ts
//
// One source of wording for "free delivery does not apply to the buy-now-pay-later
// methods", so the announcement bar, product page, cart progress bar and checkout
// cannot drift apart.
//
// Koko is gated behind NEXT_PUBLIC_KOKO_ENABLED, matching how the announcement bar
// and installment note already decide whether to name it — there is no equivalent
// public flag for Mintpay, which those surfaces advertise unconditionally, so this
// follows the same precedent.
//
// The `process.env.NEXT_PUBLIC_*` reads are written as literals on purpose: Next
// inlines them at build time by exact textual match, so they must not be hoisted
// into a variable or accessed dynamically.

/** Names of the excluded methods currently advertised, e.g. "Koko & Mintpay". */
export function excludedMethodNames(): string {
  const kokoEnabled = process.env.NEXT_PUBLIC_KOKO_ENABLED === "true";
  return kokoEnabled ? "Koko & Mintpay" : "Mintpay";
}

/** Short parenthetical for use beside free-delivery copy. */
export function freeDeliveryExclusionNote(): string {
  return `excludes ${excludedMethodNames()}`;
}
