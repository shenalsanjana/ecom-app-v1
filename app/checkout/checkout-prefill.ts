export type CheckoutPrefill = {
  name: string;
  email: string;
  phone: string;
  address: { line1: string; line2: string; city: string } | null;
};

/**
 * Maps a logged-in customer's DB row + default address into the checkout
 * pre-fill shape. Returns null for guests (no db user). Pure — unit-tested.
 */
export function resolveCheckoutPrefill(
  dbUser: { name: string | null; email: string | null; phone: string | null } | null,
  defaultAddress: { line1: string; line2: string | null; city: string } | null,
  fallbackName: string,
): CheckoutPrefill | null {
  if (!dbUser) return null;
  return {
    name: dbUser.name ?? fallbackName ?? "",
    email: dbUser.email ?? "",
    phone: dbUser.phone ?? "",
    address: defaultAddress
      ? { line1: defaultAddress.line1, line2: defaultAddress.line2 ?? "", city: defaultAddress.city }
      : null,
  };
}
