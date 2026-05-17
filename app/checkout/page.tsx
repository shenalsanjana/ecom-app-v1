// app/checkout/page.tsx
import { auth } from "@/app/_lib/auth";
import { CheckoutClient } from "./checkout-client";
import { SiteFooter } from "@/app/_components/home/site-footer";

export default async function CheckoutPage() {
  const session = await auth();
  const user = session?.user
    ? {
        name: session.user.name ?? "",
        email: session.user.email ?? "",
      }
    : null;

  // Empty list is OK — the client falls back to a free-text input.
  const cities: Array<{ id: number; name: string }> = [];

  return (
    <>
      <CheckoutClient user={user} cities={cities} />
      <SiteFooter />
    </>
  );
}
