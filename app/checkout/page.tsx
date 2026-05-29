// app/checkout/page.tsx
import { auth } from "@/app/_lib/auth";
import { CheckoutClient } from "./checkout-client";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { checkoutPaymentOptions } from "@/app/_lib/payments/registry";

export default async function CheckoutPage() {
  const session = await auth();
  const user = session?.user
    ? {
        name: session.user.name ?? "",
        email: session.user.email ?? "",
      }
    : null;

  return (
    <>
      <CheckoutClient user={user} paymentOptions={checkoutPaymentOptions()} />
      <SiteFooter />
    </>
  );
}
