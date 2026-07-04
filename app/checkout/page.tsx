// app/checkout/page.tsx
import { auth } from "@/app/_lib/auth";
import { prisma } from "@/app/_lib/prisma";
import { CheckoutClient } from "./checkout-client";
import { resolveCheckoutPrefill } from "./checkout-prefill";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { checkoutPaymentOptions } from "@/app/_lib/payments/registry";
import { catalogueByDistrict } from "@/app/_lib/courier/catalogue";

export default async function CheckoutPage() {
  const session = await auth();

  let user = null;
  if (session?.user?.id) {
    const [dbUser, defaultAddress] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true, phone: true },
      }),
      prisma.address.findFirst({
        where: { userId: session.user.id },
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
        select: { line1: true, line2: true, city: true },
      }),
    ]);
    user = resolveCheckoutPrefill(dbUser, defaultAddress, session.user.name ?? "");
  }

  return (
    <>
      <CheckoutClient
        user={user}
        paymentOptions={checkoutPaymentOptions()}
        cityGroups={catalogueByDistrict()}
      />
      <SiteFooter />
    </>
  );
}
