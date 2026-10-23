"use client";

import { calculateDelivery, type DeliveryConfig } from "@/app/_lib/checkout-config";
import { DELIVERY_CITIES, zoneForCity } from "@/app/_lib/delivery-zones";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Search, ShoppingBasket, Plus, Minus, Trash2, ReceiptText } from "lucide-react";
import { completePosSale, searchPosProducts, getPosDeliveryConfig } from "@/app/admin/pos/actions";
import { formatPrice } from "@/app/_lib/format";
import { POS_MAX_CENTS, POS_PAYMENT_LABELS, PosPaymentMethodSchema, type PosPaymentMethod, posTotal, PosSaleSchema, type PosCartLine, type PosProduct, type PosSaleInput } from "@/app/_lib/pos";
import { PosCatalogue } from "./pos-catalogue";

const DRAFT_KEY = "dressing-bear-pos-draft-v1";
const money = (cents: number) => formatPrice(cents / 100);
const field = "w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60";
const subscribe = () => () => {};

function readDraft() {
  const fresh = { cart: [] as PosCartLine[], method: "CASH" as PosPaymentMethod, tendered: "", reference: "", customer: "",
    shipping: false, phone: "", line1: "", line2: "", city: "",
    operationKey: crypto.randomUUID() as string, pendingSale: null as PosSaleInput | null };
  try {
    const stored = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null");
    if (!stored || !Array.isArray(stored.cart) || !stored.cart.every((line: PosCartLine) =>
      line && [line.sizeStockId, line.name, line.sku, line.color, line.size].every(value => typeof value === "string") &&
      Number.isSafeInteger(line.price) && line.price > 0 && Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= 99)) return fresh;
    const pending = PosSaleSchema.safeParse(stored.pendingSale);
    return { cart: stored.cart as PosCartLine[], method: PosPaymentMethodSchema.catch("CASH").parse(stored.method),
      tendered: typeof stored.tendered === "string" ? stored.tendered : "",
      reference: typeof stored.reference === "string" ? stored.reference : "",
      customer: typeof stored.customer === "string" ? stored.customer : "",
      operationKey: pending.success ? pending.data.operationKey :
        typeof stored.operationKey === "string" && /^[0-9a-f-]{36}$/i.test(stored.operationKey) ? stored.operationKey : fresh.operationKey,
      shipping: stored.shipping === true || stored.method === "COD",
      phone: typeof stored.phone === "string" ? stored.phone : "",
      line1: typeof stored.line1 === "string" ? stored.line1 : "",
      line2: typeof stored.line2 === "string" ? stored.line2 : "",
      city: typeof stored.city === "string" ? stored.city : "",
      pendingSale: pending.success ? pending.data : null };
  } catch { return fresh; }
}

export function PosRegister({ initialProducts, initialDeliveryConfig }: { initialProducts: PosProduct[]; initialDeliveryConfig: DeliveryConfig }) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  return hydrated ? <Register initialProducts={initialProducts} initialDeliveryConfig={initialDeliveryConfig} /> : <p className="text-sm text-muted-foreground">Loading register…</p>;
}

function Register({ initialProducts, initialDeliveryConfig }: { initialProducts: PosProduct[]; initialDeliveryConfig: DeliveryConfig }) {
  const [draft] = useState(readDraft);
  const [products, setProducts] = useState(initialProducts);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState(draft.cart);
  const [method, setMethod] = useState(draft.method);
  const [tendered, setTendered] = useState(draft.tendered);
  const [reference, setReference] = useState(draft.reference);
  const [customer, setCustomer] = useState(draft.customer);
  const [deliveryConfig, setDeliveryConfig] = useState(initialDeliveryConfig);
  const [shipping, setShipping] = useState(draft.shipping);
  const [phone, setPhone] = useState(draft.phone);
  const [line1, setLine1] = useState(draft.line1);
  const [line2, setLine2] = useState(draft.line2);
  const [city, setCity] = useState(draft.city);
  const [operationKey, setOperationKey] = useState(draft.operationKey);
  const [pendingSale, setPendingSale] = useState<PosSaleInput | null>(draft.pendingSale);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(draft.pendingSale ? "A sale is awaiting confirmation. Retry it with the same details before starting another sale." : "");
  const [lastSale, setLastSale] = useState<{ orderId: string; posNumber: string } | null>(null);
  const searchVersion = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const pendingIntent = useRef(draft.pendingSale);
  const locked = saving || !!pendingSale;
  const subtotal = posTotal(cart);
  const shippingCents = shipping ? Math.round(calculateDelivery(subtotal / 100, zoneForCity(city), deliveryConfig, method) * 100) : 0;
  const total = subtotal + shippingCents;
  const received = tendered.trim() ? Number(tendered) * 100 : NaN;
  const receivedCents = Math.round(received);
  const validCash = Number.isFinite(received) && Math.abs(received - receivedCents) < 0.00001 && receivedCents >= total && receivedCents <= POS_MAX_CENTS;
  const currentSale: PosSaleInput = {
    operationKey, items: cart.map(line => ({ sizeStockId: line.sizeStockId, quantity: line.quantity, expectedPrice: line.price })),
    paymentMethod: method, tendered: method === "CASH" ? receivedCents : method === "COD" ? 0 : total,
    paymentReference: reference, customerName: customer,
    ...(shipping ? { delivery: { carrier: "ROYAL_EXPRESS", phone, line1, line2, city, expectedCharge: shippingCents } } : {}),
  };
  const canSubmit = PosSaleSchema.safeParse(currentSale).success && cart.length > 0 && total > 0 && total <= POS_MAX_CENTS &&
    (method === "COD" ? shipping : method !== "CASH" ? !!reference.trim() : validCash);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ cart, method, tendered, reference, customer, shipping, phone, line1, line2, city, operationKey, pendingSale }));
    } catch { /* The register still works when browser storage is unavailable. */ }
  }, [cart, method, tendered, reference, customer, shipping, phone, line1, line2, city, operationKey, pendingSale]);

  async function refreshProducts() {
    const version = ++searchVersion.current;
    setSearching(true);
    try {
      const [result, pricing] = await Promise.all([searchPosProducts(""), getPosDeliveryConfig()]);
      if (version === searchVersion.current) setDeliveryConfig(pricing);
      if (version === searchVersion.current) setProducts(result);
      return result;
    } catch {
      if (version === searchVersion.current) setError("Could not load products. Try searching again.");
      return [];
    } finally {
      if (version === searchVersion.current) setSearching(false);
    }
  }

  function addProduct(product: PosProduct) {
    if (locked || submitting.current || pendingIntent.current) return;
    setError("");
    setLastSale(null);
    setCart(current => {
      const existing = current.find(line => line.sizeStockId === product.sizeStockId);
      if ((existing?.quantity ?? 0) >= Math.min(product.available, 99)) return current;
      return existing ? current.map(line => line.sizeStockId === product.sizeStockId
        ? { ...product, quantity: line.quantity + 1 } : line) : [...current, { ...product, quantity: 1 }];
    });
  }

  async function submitSale() {
    if (submitting.current || (!pendingSale && !canSubmit)) return;
    const sale = pendingSale ?? currentSale;
    submitting.current = true;
    setSaving(true);
    setError("");
    setPendingSale(sale);
    pendingIntent.current = sale;
    // Persist before making the request, so refresh cannot lose an in-flight intent.
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ cart, method, tendered, reference, customer, shipping, phone, line1, line2, city, operationKey, pendingSale: sale })); } catch {}
    try {
      const result = await completePosSale(sale);
      if (!result.success) {
        setError(result.error);
        if (!result.uncertain) { setPendingSale(null); pendingIntent.current = null; }
        return;
      }
      setLastSale(result);
      setCart([]); setTendered(""); setReference(""); setCustomer(""); setMethod("CASH"); setShipping(false); setPhone(""); setLine1(""); setLine2(""); setCity("");
      setOperationKey(crypto.randomUUID()); setPendingSale(null);
      pendingIntent.current = null;
      try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
      await refreshProducts();
      searchInput.current?.focus();
    } catch {
      setError("The sale is awaiting confirmation. Retry with the same details to avoid a duplicate sale.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-4">
        <form onSubmit={async e => {
          e.preventDefault();
          const result = await refreshProducts();
          const exact = result.find(product => product.sku.toLowerCase() === query.trim().toLowerCase());
          if (exact && exact.available > 0) { addProduct(exact); setQuery(""); }
        }} className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
            <input ref={searchInput} value={query} onChange={e => setQuery(e.target.value)} maxLength={120}
              aria-label="Search products or scan SKU" placeholder="Search product, colour, or scan SKU…" className={`${field} pl-9`} />
          </div>
          <button type="submit" disabled={searching} className="rounded-md border px-4 text-sm hover:bg-secondary disabled:opacity-50">
            {searching ? "Searching…" : "Search"}
          </button>
        </form>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Choose a category, then a product.</span>
          <button type="button" onClick={() => void refreshProducts()} disabled={searching} className="underline underline-offset-4">Refresh products</button>
        </div>
        <PosCatalogue options={products} query={query} locked={locked} onAdd={addProduct} onClearSearch={() => setQuery("")} />
      </div>

      <div className="space-y-4 xl:sticky xl:top-4">
        {lastSale && <div role="status" className="rounded-xl border border-emerald-600 bg-emerald-50 p-4 text-emerald-950">
          <p className="font-semibold">Sale {lastSale.posNumber} completed</p>
          <Link href={`/admin/orders/${lastSale.orderId}`} className="mt-2 block text-sm underline">Manage order & delivery</Link>
          <Link href={`/admin/pos/receipts/${lastSale.orderId}`} target="_blank" className="mt-2 inline-flex items-center gap-2 text-sm underline underline-offset-4"><ReceiptText className="size-4" />View / print receipt</Link>
        </div>}
        {error && <p role="alert" className="rounded-lg border border-destructive bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold"><ShoppingBasket className="size-5" />Current sale</h2>
            <button disabled={locked || !cart.length} onClick={() => { setCart([]); setTendered(""); setError(""); setOperationKey(crypto.randomUUID()); }} className="text-xs text-muted-foreground underline disabled:opacity-50">Clear cart</button>
          </div>
          {!cart.length ? <p className="py-8 text-center text-sm text-muted-foreground">Choose a product to start a sale.</p> : (
            <ul className="max-h-96 space-y-4 overflow-y-auto">
              {cart.map(line => <li key={line.sizeStockId} className="border-b pb-3 last:border-0">
                <div className="flex justify-between gap-2"><span className="text-sm font-medium">{line.name}</span><span className="shrink-0 text-sm">{money(line.price * line.quantity)}</span></div>
                <p className="mt-1 text-xs text-muted-foreground">{line.color} · {line.size} · {line.sku}</p>
                <div className="mt-2 flex items-center gap-2">
                  <button disabled={locked || line.quantity <= 1} aria-label={`Decrease ${line.sku}`} className="rounded border p-1 disabled:opacity-40" onClick={() => setCart(current => current.map(item => item.sizeStockId === line.sizeStockId ? { ...item, quantity: item.quantity - 1 } : item))}><Minus className="size-3" /></button>
                  <span className="min-w-5 text-center text-sm">{line.quantity}</span>
                  <button disabled={locked || line.quantity >= Math.min(line.available, 99)} aria-label={`Increase ${line.sku}`} className="rounded border p-1 disabled:opacity-40" onClick={() => addProduct(line)}><Plus className="size-3" /></button>
                  <span className="text-xs text-muted-foreground">× {money(line.price)}</span>
                  <button disabled={locked} aria-label={`Remove ${line.sku}`} className="ml-auto p-1 text-muted-foreground disabled:opacity-40" onClick={() => setCart(current => current.filter(item => item.sizeStockId !== line.sizeStockId))}><Trash2 className="size-4" /></button>
                </div>
              </li>)}
            </ul>
          )}
          <div className="mt-4 flex items-center justify-between border-t pt-4 text-lg font-semibold"><span>Total</span><span>{money(total)}</span></div>
          {shipping ? <div className="mt-2 flex justify-between text-sm"><span>Delivery · {zoneForCity(city) === "COLOMBO" ? "Colombo" : "Outside Colombo"}</span><span>{money(shippingCents)}</span></div>
            : <p className="mt-1 text-xs text-muted-foreground">In-store collection · No delivery fee</p>}
          <div className="mt-5 space-y-4">
            <label className="block space-y-1 text-sm"><span>Customer name {shipping ? "(required)" : "(optional)"}</span><input value={customer} onChange={e => setCustomer(e.target.value)} disabled={locked} maxLength={100} placeholder="Walk-in customer" className={field} /></label>
            <label className="block space-y-1 text-sm"><span>Fulfilment</span>
              <select aria-label="Fulfilment" value={shipping ? "ROYAL_EXPRESS" : "COLLECTION"} disabled={locked || method === "COD"} onChange={e => setShipping(e.target.value === "ROYAL_EXPRESS")} className={field}>
                <option value="COLLECTION">In-store collection</option><option value="ROYAL_EXPRESS">Royal Express Delivery</option>
              </select>
            </label>
            {shipping && <div className="space-y-3 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Enter the complete delivery address and contact number. <Link href="/admin/settings" className="underline">Configure delivery charges</Link></p>
              <label className="block space-y-1 text-sm"><span>Contact number</span><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} disabled={locked} maxLength={30} placeholder="0771234567" className={field} /></label>
              <label className="block space-y-1 text-sm"><span>Delivery address</span><input value={line1} onChange={e => setLine1(e.target.value)} disabled={locked} maxLength={200} placeholder="House / building number and street" className={field} /></label>
              <label className="block space-y-1 text-sm"><span>Address line 2 (optional)</span><input value={line2} onChange={e => setLine2(e.target.value)} disabled={locked} maxLength={200} className={field} /></label>
              <label className="block space-y-1 text-sm"><span>Delivery city</span><select value={city} onChange={e => setCity(e.target.value)} disabled={locked} className={field}><option value="">Select city</option>{DELIVERY_CITIES.filter(c => c.name !== "Mt. Lavinia").map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select></label>
              <p className="text-xs text-muted-foreground">Sri Lanka · Rates and free delivery follow store delivery settings.</p>
            </div>}
            <fieldset disabled={locked}>
              <legend className="mb-2 text-sm">Payment method</legend>
              <div className="grid grid-cols-2 gap-2">{(["CASH", "CARD", "KOKO", "MINTPAY", "BANK_TRANSFER", "COD"] as const).map(value => <label key={value} className={`flex flex-1 cursor-pointer items-center gap-2 rounded-md border p-3 text-sm ${method === value ? "border-primary bg-secondary" : ""}`}><input type="radio" name="pos-payment" checked={method === value} onChange={() => { setMethod(value); setReference(""); if (value === "COD") setShipping(true); }} />{POS_PAYMENT_LABELS[value]}</label>)}</div>
            </fieldset>
            {method === "CASH" ? <>
              <label className="block space-y-1 text-sm"><span>Cash received (LKR)</span><input value={tendered} onChange={e => setTendered(e.target.value)} type="number" min="0" max={POS_MAX_CENTS / 100} step="0.01" inputMode="decimal" disabled={locked} className={field} /></label>
              <button type="button" disabled={locked || !cart.length} onClick={() => setTendered((total / 100).toFixed(2))} className="text-xs underline underline-offset-4 disabled:opacity-50">Exact cash</button>
              <div className="flex justify-between text-sm"><span>Change</span><strong>{validCash ? money(receivedCents - total) : "—"}</strong></div>
            </> : method === "COD" ? <p className="text-sm">{money(total)} to collect on delivery. No upfront payment. Manage dispatch and collection in Orders.</p> : <>
              <p className="text-xs text-muted-foreground">Approve {money(total)} {method === "CARD" ? "on your card terminal" : `through ${POS_PAYMENT_LABELS[method]}`} first, then enter its payment reference.</p>
              <label className="block space-y-1 text-sm"><span>{method === "CARD" ? "Approved terminal reference" : `Approved ${POS_PAYMENT_LABELS[method]} reference`}</span><input value={reference} onChange={e => setReference(e.target.value)} maxLength={100} disabled={locked} className={field} /></label>
            </>}
            <button type="button" onClick={() => void submitSale()} disabled={saving || (!pendingSale && !canSubmit)} className="w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {saving ? "Completing sale…" : pendingSale ? "Retry sale confirmation" : `Complete sale · ${money(total)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
