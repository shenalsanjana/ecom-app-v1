// app/checkout/page.tsx
import { auth } from "@/app/_lib/auth";
import { CheckoutClient } from "./checkout-client";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { listAvailableCities } from "@/app/_lib/courier/city-map";

export default async function CheckoutPage() {
  const session = await auth();
  const user = session?.user
    ? {
        name: session.user.name ?? "",
        email: session.user.email ?? "",
      }
    : null;

  // Empty list is OK — the client falls back to a free-text input.
  let cities: Array<{ id: number; name: string }> = [];
  try {
    cities = await listAvailableCities();
  } catch (err) {
    console.error("[checkout] Failed to load city list, falling back to text input:", err);
  }

  return (
    <>
      <CheckoutClient user={user} cities={cities} />
      <SiteFooter />
    </>
  );
}
