// app/api/payhere/payment/route.ts
import { NextResponse } from "next/server";
import { payHereApiUrl, payHereCredentials } from "@/app/_lib/payhere-config";
import { z } from "zod";

const PaymentRequestSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.literal("LKR").default("LKR"),
  items: z
    .array(z.object({ name: z.string(), quantity: z.number().int().positive(), amount: z.number().nonnegative() }))
    .default([]),
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string(),
  }),
  returnUrl: z.string().url().default(`${process.env.APP_URL}/checkout/success`),
  notifyUrl: z.string().url().default(`${process.env.APP_URL}/api/payhere/webhook`),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PaymentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { orderId, amount, currency, items, customer, returnUrl, notifyUrl } = parsed.data;

  const { app_id, app_secret } = payHereCredentials();
  const apiUrl = payHereApiUrl();

  // Base64 encode "app_id:app_secret" for Basic auth
  const authHeader = `Basic ${Buffer.from(`${app_id}:${app_secret}`).toString("base64")}`;

  // PayHere expects items as a pipe-delimited string: "name|quantity|amount|name2|quantity2|amount2"
  const itemsString = items.length > 0
    ? items.map((it) => `${it.name}|${it.quantity}|${Math.round(it.amount)}`).join("|")
    : undefined;

  const nameParts = customer.name.split(" ");
  const first_name = nameParts[0];
  const last_name = nameParts.slice(1).join(" ") || customer.name;

  const payload = new URLSearchParams({
    return_url: returnUrl,
    cancel_url: returnUrl,
    notify_url: notifyUrl,
    order_id: orderId,
    items: itemsString ?? "Dressing Bear Order",
    currency,
    amount: String(amount),
    first_name,
    last_name,
    email: customer.email,
    phone: customer.phone,
  });

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: authHeader,
      },
      body: payload.toString(),
    });
  } catch (err) {
    console.error("[payhere/payment] network error:", err);
    return NextResponse.json({ error: "Failed to reach PayHere. Please try again." }, { status: 502 });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("[payhere/payment] PayHere API error:", response.status, text);
    return NextResponse.json({ error: "PayHere rejected the payment request." }, { status: 502 });
  }

  const data = await response.json().catch(() => null);

  // PayHere returns { status: "success", payment_id: "..." } or { status: "error", message: "..." }
  if (!data || data.status === "error") {
    return NextResponse.json(
      { error: data?.message ?? "PayHere returned an unexpected response." },
      { status: 502 },
    );
  }

  if (!data.payment_id) {
    console.error("[payhere/payment] No payment_id in PayHere response:", data);
    return NextResponse.json({ error: "PayHere did not return a payment ID." }, { status: 502 });
  }

  return NextResponse.json({ paymentId: data.payment_id });
}