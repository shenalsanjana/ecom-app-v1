// app/checkout/page.tsx
import { auth } from "@/app/_lib/auth";
import { CheckoutClient } from "./checkout-client";

export default async function CheckoutPage() {
  const session = await auth();
  const user = session?.user
    ? {
        name: session.user.name ?? "",
        email: session.user.email ?? "",
      }
    : null;
  return <CheckoutClient user={user} />;
}
