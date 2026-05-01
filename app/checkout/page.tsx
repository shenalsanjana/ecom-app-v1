// app/checkout/page.tsx
import { auth } from "@/app/_lib/auth";
import { CheckoutClient } from "./checkout-client";

export default async function CheckoutPage() {
  return <CheckoutClient />;
}