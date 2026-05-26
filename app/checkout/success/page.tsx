// app/checkout/success/page.tsx
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShoppingBag, Truck, CheckCircle } from "lucide-react";
import { prisma } from "@/app/_lib/prisma";
import { orderReference } from "@/app/_lib/order-reference";
import { paymentStatusLabel } from "@/app/_lib/order-status";
import { formatPrice } from "@/app/_lib/format";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { ProfileMenu } from "@/app/_components/header/profile-menu";

async function OrderDetails({ orderId, paymentStatus }: { orderId: string; paymentStatus?: string }) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) return notFound();

  const ref = orderReference(order);
  const isPaid = paymentStatus === "COMPLETED" || order.paymentStatus === "PAID";
  const isCod = order.paymentMethod === "COD";
  const isCancelled = paymentStatus === "cancelled" && !isPaid;

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        {/* Icon */}
        <div
          className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6 ${
            isPaid || isCod ? "bg-green-100" : isCancelled ? "bg-red-100" : "bg-yellow-100"
          }`}
        >
          {isPaid || isCod ? (
            <CheckCircle className="h-10 w-10 text-green-600" />
          ) : isCancelled ? (
            <ShoppingBag className="h-10 w-10 text-red-600" />
          ) : (
            <ShoppingBag className="h-10 w-10 text-yellow-600" />
          )}
        </div>

        {/* Heading */}
        {isPaid ? (
          <>
            <h1 className="text-3xl font-bold mb-3">Payment Confirmed!</h1>
            <p className="text-muted-foreground text-lg mb-2">
              Thank you for your order. Your payment has been received.
            </p>
          </>
        ) : isCancelled ? (
          <>
            <h1 className="text-3xl font-bold mb-3">Payment Cancelled</h1>
            <p className="text-muted-foreground text-lg mb-2">
              Your payment was cancelled. Your order has not been confirmed.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold mb-3">Order Placed!</h1>
            <p className="text-muted-foreground text-lg mb-2">
              Your order is confirmed and awaiting payment.
            </p>
          </>
        )}

        {/* Order reference */}
        <div className="bg-muted rounded-lg p-4 mb-8 inline-block">
          <p className="text-sm text-muted-foreground mb-1">Order Reference</p>
          <p className="text-2xl font-bold font-mono">{ref}</p>
        </div>

        {/* Payment and delivery info */}
        <div className="bg-card border rounded-xl p-6 mb-8 text-left space-y-4">
          {!isCancelled && (
            <div className="flex items-start gap-4">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isPaid ? "bg-green-100" : "bg-yellow-100"
                }`}
              >
                <Truck className={`h-5 w-5 ${isPaid ? "text-green-600" : "text-yellow-600"}`} />
              </div>
              <div>
                <p className="font-semibold">Estimated Delivery</p>
                <p className="text-sm text-muted-foreground">
                  {order.shippingCity}, {order.shippingCountry}
                </p>
                <p className="text-sm text-muted-foreground">
                  via Royal Express · 2–5 business days
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-4">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                isPaid ? "bg-green-100" : "bg-yellow-100"
              }`}
            >
              <ShoppingBag className={`h-5 w-5 ${isPaid ? "text-green-600" : "text-yellow-600"}`} />
            </div>
            <div>
              <p className="font-semibold">Order Total</p>
              <p className="text-lg font-bold">{formatPrice(order.total)}</p>
              <p className="text-sm text-muted-foreground">
                {order.paymentMethodDisplay ?? order.paymentMethod} ·{" "}
                {paymentStatusLabel(order.paymentStatus) ?? "Pending"}
              </p>
            </div>
          </div>
        </div>

        {/* Items summary */}
        <div className="bg-card border rounded-xl p-6 mb-8 text-left">
          <h2 className="font-semibold mb-4">Items Ordered</h2>
          <div className="space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between items-center text-sm">
                <span>
                  {item.name}
                  {item.size ? ` (${item.size})` : ""} × {item.quantity}
                </span>
                <span className="font-medium">{formatPrice(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="border-t mt-4 pt-4 flex justify-between font-semibold">
            <span>Total</span>
            <span>{formatPrice(order.total)}</span>
          </div>
        </div>

        {/* CTA */}
        {isCancelled ? (
          <div className="flex flex-col items-center gap-3">
            <Link
              href="/checkout"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6 py-2"
            >
              Try Again
            </Link>
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              Continue Shopping
            </Link>
          </div>
        ) : (
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6 py-2"
          >
            Continue Shopping
          </Link>
        )}
      </div>
    </main>
  );
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string; status?: string }>;
}) {
  const params = await searchParams;
  const orderId = params.order_id;

  if (!orderId) {
    return (
      <main className="flex-1 flex items-center justify-center py-20">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Invalid Order</h1>
          <p className="text-muted-foreground mb-6">No order ID provided.</p>
          <Link href="/" className="text-primary hover:underline">Return to Home</Link>
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Dressing Bear
          </Link>
          <div className="ml-auto">
            <ProfileMenu />
          </div>
        </div>
      </header>
      <Suspense
        fallback={
          <main className="flex-1 flex items-center justify-center py-20">
            <p className="text-muted-foreground">Loading order details...</p>
          </main>
        }
      >
        <OrderDetails orderId={orderId} paymentStatus={params.status} />
      </Suspense>
      <SiteFooter />
    </>
  );
}
