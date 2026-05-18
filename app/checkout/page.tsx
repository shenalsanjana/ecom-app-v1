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

  const cities = await listAvailableCities();

  return (
    <>
      <CheckoutClient user={user} cities={cities} />
      <SiteFooter />
    </>
  );
}
