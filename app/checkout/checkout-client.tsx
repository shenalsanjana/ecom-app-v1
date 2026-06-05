// app/checkout/checkout-client.tsx
"use client";

import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShoppingBag, Truck, CreditCard, User, FileText, Loader2 } from "lucide-react";
import { useCart } from "@/app/_lib/cart-context";
import { processOrder, type PaymentMethod } from "./actions";
import { ProfileMenu } from "@/app/_components/header/profile-menu";
import { InstallmentNote } from "@/app/_components/shared/installment-note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/app/_lib/format";
import { calculateDelivery } from "@/app/_lib/checkout-config";
import { useDeliveryConfig } from "@/app/_components/delivery/delivery-config-provider";
import { DELIVERY_CITIES, zoneForCity } from "@/app/_lib/delivery-zones";
import {
  paymentErrorMessage,
  readPaymentInitiationResponse,
  submitPaymentCheckoutForm,
} from "./payhere-client";
import { PaymentMethodIcon } from "@/app/_components/shared/payment-method-icon";

type CheckoutUser = { name: string; email: string } | null;

type Props = {
  user: CheckoutUser;
  paymentOptions: { id: PaymentMethod; name: string; description: string; icon: string }[];
};

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CheckoutClient({ user, paymentOptions }: Props) {
  const router = useRouter();
  const { items, clearCart } = useCart();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderReference, setOrderReference] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  // Once an online order exists in the DB, hold its id so a failed redirect
  // (network blip, gateway init error) can be retried without creating a
  // duplicate order.
  const [pendingOnlineOrderId, setPendingOnlineOrderId] = useState<string | null>(null);
  const [redirectingProvider, setRedirectingProvider] = useState<string | null>(null);
  const idempotencyKey = useMemo(() => generateIdempotencyKey(), []);


  const isGuest = !user;

  const [guest, setGuest] = useState({
    name: "",
    email: "",
  });

  const [phone, setPhone] = useState("");

  const [address, setAddress] = useState({
    line1: "",
    line2: "",
    city: "",
    country: "Sri Lanka",
  });

  const [notes, setNotes] = useState("");

  const deliveryConfig = useDeliveryConfig();
  const { freeThreshold: FREE_DELIVERY_THRESHOLD } = deliveryConfig;
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = calculateDelivery(subtotal, zoneForCity(address.city ?? ""), deliveryConfig);
  const total = subtotal + shipping;

  if (orderId) {
    return (
      <>
        <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
            <Link href="/" className="text-lg font-semibold tracking-tight">Dressing Bear</Link>
            <div className="ml-auto">
              <ProfileMenu />
            </div>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-20">
          <div className="text-center max-w-md">
            <div className="mx-auto w-16 h-16 bg-brand/10 rounded-full flex items-center justify-center mb-4">
              <ShoppingBag className="h-8 w-8 text-brand" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Order Confirmed!</h1>
            <p className="text-muted-foreground mb-2">Thank you for your order.</p>
            <p className="text-lg font-semibold mb-6">Order: {orderReference ?? orderId}</p>
            <p className="text-sm text-muted-foreground mb-6">
              {paymentMethod === "COD"
                ? "Your items will be delivered with Cash on Delivery."
                : `Your payment via ${paymentOptions.find((p) => p.id === paymentMethod)?.name ?? paymentMethod} is being processed.`}
            </p>
            <Button onClick={() => router.push("/")} className="w-full">
              Continue Shopping
            </Button>
          </div>
        </main>

      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
            <Link href="/" className="text-lg font-semibold tracking-tight">Dressing Bear</Link>
            <div className="ml-auto">
              <ProfileMenu />
            </div>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-20">
          <div className="text-center max-w-md">
            <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h1 className="text-xl font-semibold mb-2">Your cart is empty</h1>
            <p className="text-muted-foreground mb-6">Add some items to checkout.</p>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
            >
              Continue Shopping
            </Link>
          </div>
        </main>

      </>
    );
  }

  // Calls the generic payment initiation endpoint and, on success, paints the
  // redirect overlay before submitting the hidden checkout form. The DB order
  // already exists at this point, so failures here can be retried without
  // creating a duplicate. The local cart is intentionally NOT cleared here —
  // the success page clears it (covers cancel/back from gateway too).
  async function initiateOnlinePayment(onlineOrderId: string) {
    setError(null);
    setPendingOnlineOrderId(onlineOrderId);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: onlineOrderId }),
      });
      const data = await readPaymentInitiationResponse(res);
      if (res.ok && data.gatewayUrl && data.fields) {
        // flushSync commits the overlay synchronously; double-rAF guarantees a
        // paint before we hand control to the gateway navigation.
        flushSync(() => setRedirectingProvider(data.displayName ?? data.provider ?? "payment gateway"));
        const { gatewayUrl, fields } = data;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => submitPaymentCheckoutForm(gatewayUrl, fields));
        });
        return;
      }
      setError(paymentErrorMessage(data.error));
    } catch {
      setError(paymentErrorMessage("Failed to initialize payment"));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Abort a redirect that's in progress (or hung) and return the user to the
  // checkout form. window.stop() cancels a top-level navigation that has been
  // submitted but not yet committed (e.g. the gateway is slow to respond). The
  // DB order already exists, so "Retry payment" can re-initiate without creating
  // a duplicate.
  function cancelRedirect() {
    if (typeof window !== "undefined" && typeof window.stop === "function") {
      window.stop();
    }
    setRedirectingProvider(null);
    setIsSubmitting(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const normalizedAddress = {
        ...address,
        line2: address.line2.trim() || undefined,
      };
      const result = await processOrder({
        items: items.map((it) => ({
          productId: it.productId,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          size: it.size,
        })),
        shippingAddress: normalizedAddress,
        paymentMethod,
        contactPhone: phone,
        guestInfo: isGuest ? { name: guest.name, email: guest.email, phone } : undefined,
        idempotencyKey,
        notes: notes.trim() || undefined,
      });

      if (result.success) {
        if (paymentMethod !== "COD") {
          setOrderReference(result.webNumber ?? result.orderId);
          await initiateOnlinePayment(result.orderId);
          return;
        }

        // COD: clear cart and show success immediately
        clearCart();
        setOrderId(result.orderId);
        setOrderReference(result.webNumber ?? result.orderId);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {redirectingProvider && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur"
          role="status"
          aria-live="polite"
        >
          <div className="text-center max-w-sm px-4">
            <Loader2 className="mx-auto h-10 w-10 text-primary animate-spin mb-4" />
            <h2 className="text-xl font-semibold mb-2">Redirecting to {redirectingProvider}…</h2>
            <p className="text-sm text-muted-foreground">
              Please don&apos;t close or refresh this page. You&apos;ll be taken to secure checkout in a moment.
            </p>
            {/* Escape hatch: the gateway's own hosted page may not offer a way
                back to our site, and a slow/hung handoff can otherwise trap the
                user on this overlay. Aborting the in-flight navigation returns
                them to checkout with the order still saved (retryable). */}
            <button
              type="button"
              onClick={cancelRedirect}
              className="mt-6 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Cancel and return to checkout
            </button>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link
            href="/cart"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to cart
          </Link>
          <Link href="/" className="text-lg font-semibold tracking-tight ml-auto">
            Dressing Bear
          </Link>
          <ProfileMenu />
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold mb-8">Checkout</h1>

          <form onSubmit={handleSubmit}>
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="space-y-6">
                {isGuest && (
                  <div className="rounded-lg border p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <User className="h-5 w-5 text-muted-foreground" />
                      <h2 className="text-lg font-semibold">Your Details</h2>
                    </div>
                    <p className="mb-4 text-sm text-muted-foreground">
                      Checking out as a guest.{" "}
                      <Link
                        href="/login?callbackUrl=/checkout"
                        className="text-primary hover:underline"
                      >
                        Sign in
                      </Link>{" "}
                      to use your saved details.
                    </p>
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="guestName" className="block text-sm font-medium mb-1">
                          Full Name *
                        </label>
                        <Input
                          id="guestName"
                          value={guest.name}
                          onChange={(e) => setGuest({ ...guest, name: e.target.value })}
                          required
                          autoComplete="name"
                          placeholder="Your name"
                        />
                      </div>
                      <div>
                        <label htmlFor="guestEmail" className="block text-sm font-medium mb-1">
                          Email *
                        </label>
                        <Input
                          id="guestEmail"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          value={guest.email}
                          onChange={(e) => setGuest({ ...guest, email: e.target.value })}
                          required
                          placeholder="you@example.com"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Truck className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Delivery Address</h2>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium mb-1">
                        Phone Number *
                      </label>
                      <Input
                        id="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        pattern="^(?:\+?94|0)?[1-9]\d{8}$"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required
                        placeholder="+94 7X XXX XXXX"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        For delivery contact.
                      </p>
                    </div>
                    <div>
                      <label htmlFor="line1" className="block text-sm font-medium mb-1">
                        Address Line 1 *
                      </label>
                      <Input
                        id="line1"
                        value={address.line1}
                        onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                        required
                        placeholder="123 Main Street"
                      />
                    </div>
                    <div>
                      <label htmlFor="line2" className="block text-sm font-medium mb-1">
                        Address Line 2
                      </label>
                      <Input
                        id="line2"
                        value={address.line2}
                        onChange={(e) => setAddress({ ...address, line2: e.target.value })}
                        placeholder="Apt, Suite, etc."
                      />
                    </div>
                    <div>
                      <label htmlFor="city" className="block text-sm font-medium mb-1">
                        City *
                      </label>
                      <select
                        id="city"
                        name="city"
                        required
                        value={address.city ?? ""}
                        onChange={(e) => setAddress({ ...address, city: e.target.value })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="" disabled>
                          Select a city
                        </option>
                        {DELIVERY_CITIES.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="country" className="block text-sm font-medium mb-1">
                        Country *
                      </label>
                      <Input
                        id="country"
                        value={address.country}
                        onChange={(e) => setAddress({ ...address, country: e.target.value })}
                        required
                        disabled
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <FileText className="h-5 w-5 text-muted-foreground" aria-hidden />
                    <Label htmlFor="notes" className="text-lg font-semibold">
                      Delivery notes
                    </Label>
                    <span className="text-xs text-muted-foreground">Optional</span>
                  </div>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                    rows={3}
                    maxLength={500}
                    placeholder="e.g. Leave at front desk; call before delivery"
                    aria-describedby="notes-counter"
                  />
                  <p id="notes-counter" className="mt-1 text-xs text-muted-foreground">
                    {notes.length}/500
                  </p>
                </div>

                <div className="rounded-lg border p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Payment Method</h2>
                  </div>

                  <div className="space-y-3">
                    {paymentOptions.map((option) => (
                      <label
                        key={option.id}
                        className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                          paymentMethod === option.id
                            ? "border-primary bg-primary/5"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="payment"
                          value={option.id}
                          checked={paymentMethod === option.id}
                          onChange={() => {
                            setPaymentMethod(option.id);
                            setPendingOnlineOrderId(null);
                            setError(null);
                          }}
                          className="h-4 w-4"
                        />
                        <span className="flex h-8 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-card">
                          <PaymentMethodIcon method={option.id} />
                        </span>
                        <div className="flex-1">
                          <span className="font-medium">{option.name}</span>
                          <span className="block text-sm text-muted-foreground">
                            {option.description}
                          </span>
                        </div>
                        {(option.id === "KOKO" || option.id === "MINTPAY") && (
                          <span className="ml-auto shrink-0 rounded-md border border-brand/30 bg-brand/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-brand">
                            Pay in 3
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="rounded-lg border p-6 sticky top-24">
                  <h2 className="text-lg font-semibold mb-4">Order Summary</h2>

                  <div className="space-y-3 text-sm">
                    {items.map((item) => (
                      <div key={item.key} className="flex justify-between">
                        <span className="text-muted-foreground">
                          {item.name}
                          {item.size ? ` (${item.size})` : ""} × {item.quantity}
                        </span>
                        <span>{formatPrice(item.price * item.quantity)}</span>
                      </div>
                    ))}
                  </div>

                  <Separator className="my-4" />

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{formatPrice(subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Delivery</span>
                      <span>{shipping === 0 ? "Free" : formatPrice(shipping)}</span>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <div className="flex justify-between text-base font-semibold">
                    <span>Total</span>
                    <span>{formatPrice(total)}</span>
                  </div>

                  <InstallmentNote total={total} className="mt-3 text-center" />

                  {subtotal >= FREE_DELIVERY_THRESHOLD && (
                    <p className="mt-2 text-sm text-brand font-medium">
                      You qualify for free delivery!
                    </p>
                  )}

                  {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

                  {error && pendingOnlineOrderId && paymentMethod !== "COD" && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full mt-3"
                      size="lg"
                      disabled={isSubmitting}
                      onClick={() => {
                        if (pendingOnlineOrderId) {
                          void initiateOnlinePayment(pendingOnlineOrderId);
                        }
                      }}
                    >
                      {isSubmitting ? "Retrying…" : "Retry payment"}
                    </Button>
                  )}

                  <Button type="submit" className="w-full mt-6" size="lg" disabled={isSubmitting}>
                    {isSubmitting
                      ? "Processing..."
                      : paymentMethod === "COD"
                      ? "Place Order (Cash on Delivery)"
                      : `Pay with ${paymentOptions.find((p) => p.id === paymentMethod)?.name ?? paymentMethod}`}
                  </Button>

                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    By placing this order, you agree to our Terms &amp; Conditions and Privacy Policy.
                  </p>
                </div>
              </div>
            </div>
          </form>
        </div>
      </main>


    </>
  );
}
