// app/checkout/checkout-client.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShoppingBag, Truck, CreditCard, User, FileText } from "lucide-react";
import { useCart } from "@/app/_lib/cart-context";
import { processOrder } from "./actions";
import { ProfileMenu } from "@/app/_components/header/profile-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/app/_lib/format";
import { calculateDelivery, FREE_DELIVERY_THRESHOLD } from "@/app/_lib/checkout-config";
import { DELIVERY_CITIES, zoneForCity } from "@/app/_lib/delivery-zones";

type PaymentMethod = "COD" | "PAYHERE" | "KOKO" | "MINITPAY";

type CheckoutUser = { name: string; email: string } | null;

type Props = {
  user: CheckoutUser;
};

const PAYMENT_OPTIONS: {
  id: PaymentMethod;
  name: string;
  description: string;
  icon: string;
}[] = [
  { id: "COD", name: "Cash on Delivery", description: "Pay when you receive your order", icon: "💵" },
  { id: "PAYHERE", name: "PayHere", description: "Pay via PayHere gateway", icon: "💳" },
  { id: "KOKO", name: "Koko", description: "Pay with Koko", icon: "🐘" },
  { id: "MINITPAY", name: "MinitPay", description: "Pay with MinitPay", icon: "📱" },
];

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CheckoutClient({ user }: Props) {
  const router = useRouter();
  const { items, clearCart } = useCart();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderReference, setOrderReference] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
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

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = calculateDelivery(subtotal, zoneForCity(address.city ?? ""));
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
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <ShoppingBag className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Order Confirmed!</h1>
            <p className="text-muted-foreground mb-2">Thank you for your order.</p>
            <p className="text-lg font-semibold mb-6">Order: {orderReference ?? orderId}</p>
            <p className="text-sm text-muted-foreground mb-6">
              {paymentMethod === "COD"
                ? "Your items will be delivered with Cash on Delivery."
                : `Your payment via ${PAYMENT_OPTIONS.find(p => p.id === paymentMethod)?.name} is being processed.`}
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
        if (paymentMethod === "PAYHERE") {
          setOrderId(result.orderId);
          setOrderReference(result.webNumber ?? result.orderId);

          try {
            const res = await fetch("/api/payhere/payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: result.orderId,
                amount: Math.round(total),
                items: items.map((it) => ({
                  name: it.name,
                  quantity: it.quantity,
                  amount: Math.round(it.price * it.quantity),
                })),
                customer: {
                  name: isGuest ? guest.name : (user?.name ?? "Customer"),
                  email: isGuest ? guest.email : (user?.email ?? ""),
                  phone,
                },
              }),
            });

            const data = await res.json();
            if (data.paymentUrl) {
              clearCart();
              window.location.href = data.paymentUrl;
              return;
            } else {
              setError("Payment gateway error. Your order is saved. Please contact support.");
            }
          } catch {
            setError("Failed to initialize PayHere. Your order is saved. Please contact support.");
          }
          return;
        }

        // COD and other methods: clear cart and show success immediately
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
                    {PAYMENT_OPTIONS.map((option) => (
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
                          onChange={() => setPaymentMethod(option.id)}
                          className="h-4 w-4"
                        />
                        <span className="text-2xl">{option.icon}</span>
                        <div className="flex-1">
                          <span className="font-medium">{option.name}</span>
                          <span className="block text-sm text-muted-foreground">
                            {option.description}
                          </span>
                        </div>
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

                  {subtotal >= FREE_DELIVERY_THRESHOLD && (
                    <p className="mt-2 text-sm text-green-600 font-medium">
                      You qualify for free delivery!
                    </p>
                  )}

                  {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

                  <Button type="submit" className="w-full mt-6" size="lg" disabled={isSubmitting}>
                    {isSubmitting
                      ? "Processing..."
                      : paymentMethod === "COD"
                      ? "Place Order (Cash on Delivery)"
                      : `Pay with ${PAYMENT_OPTIONS.find((p) => p.id === paymentMethod)?.name}`}
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
