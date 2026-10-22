"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Search, ShoppingBasket, Plus, Minus, Trash2, ReceiptText } from "lucide-react";
import { completePosSale, searchPosProducts } from "@/app/admin/pos/actions";
import { formatPrice } from "@/app/_lib/format";
import { POS_MAX_CENTS, POS_PAYMENT_LABELS, PosPaymentMethodSchema, type PosPaymentMethod, posTotal, PosSaleSchema, type PosCartLine, type PosProduct, type PosSaleInput } from "@/app/_lib/pos";
import { PosCatalogue } from "./pos-catalogue";

const DRAFT_KEY = "dressing-bear-pos-draft-v1";
const money = (cents: number) => formatPrice(cents / 100);
const field = "w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60";
const subscribe = () => () => {};

function readDraft() {
  const fresh = { cart: [] as PosCartLine[], method: "CASH" as PosPaymentMethod, tendered: "", reference: "", customer: "",
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
      pendingSale: pending.success ? pending.data : null };
  } catch { return fresh; }
}

export function PosRegister({ initialProducts }: { initialProducts: PosProduct[] }) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  return hydrated ? <Register initialProducts={initialProducts} /> : <p className="text-sm text-muted-foreground">Loading register…</p>;
}

function Register({ initialProducts }: { initialProducts: PosProduct[] }) {
  const [draft] = useState(readDraft);
  const [products, setProducts] = useState(initialProducts);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState(draft.cart);
  const [method, setMethod] = useState(draft.method);
  const [tendered, setTendered] = useState(draft.tendered);
  const [reference, setReference] = useState(draft.reference);
  const [customer, setCustomer] = useState(draft.customer);
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
  const total = posTotal(cart);
  const received = tendered.trim() ? Number(tendered) * 100 : NaN;
  const receivedCents = Math.round(received);
  const validCash = Number.isFinite(received) && Math.abs(received - receivedCents) < 0.00001 && receivedCents >= total && receivedCents <= POS_MAX_CENTS;
  const canSubmit = cart.length > 0 && total > 0 && total <= POS_MAX_CENTS &&
    (method !== "CASH" ? !!reference.trim() : validCash);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ cart, method, tendered, reference, customer, operationKey, pendingSale }));
    } catch { /* The register still works when browser storage is unavailable. */ }
  }, [cart, method, tendered, reference, customer, operationKey, pendingSale]);

  async function refreshProducts() {
    const version = ++searchVersion.current;
    setSearching(true);
    try {
      const result = await searchPosProducts("");
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
    const sale = pendingSale ?? {
      operationKey, items: cart.map(line => ({ sizeStockId: line.sizeStockId, quantity: line.quantity, expectedPrice: line.price })),
      paymentMethod: method, tendered: method === "CASH" ? receivedCents : total,
      paymentReference: reference, customerName: customer,
    };
    submitting.current = true;
    setSaving(true);
    setError("");
    setPendingSale(sale);
    pendingIntent.current = sale;
    // Persist before making the request, so refresh cannot lose an in-flight intent.
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ cart, method, tendered, reference, customer, operationKey, pendingSale: sale })); } catch {}
    try {
      const result = await completePosSale(sale);
      if (!result.success) {
        setError(result.error);
        if (!result.uncertain) { setPendingSale(null); pendingIntent.current = null; }
        return;
      }
      setLastSale(result);
      setCart([]); setTendered(""); setReference(""); setCustomer(""); setMethod("CASH");
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
          <p className="mt-1 text-xs text-muted-foreground">In-store collection · No delivery fee</p>
          <div className="mt-5 space-y-4">
            <label className="block space-y-1 text-sm"><span>Customer name <span className="text-muted-foreground">(optional)</span></span><input value={customer} onChange={e => setCustomer(e.target.value)} disabled={locked} maxLength={100} placeholder="Walk-in customer" className={field} /></label>
            <fieldset disabled={locked}>
              <legend className="mb-2 text-sm">Payment method</legend>
              <div className="grid grid-cols-2 gap-2">{(["CASH", "CARD", "KOKO", "MINTPAY"] as const).map(value => <label key={value} className={`flex flex-1 cursor-pointer items-center gap-2 rounded-md border p-3 text-sm ${method === value ? "border-primary bg-secondary" : ""}`}><input type="radio" name="pos-payment" checked={method === value} onChange={() => { setMethod(value); setReference(""); }} />{POS_PAYMENT_LABELS[value]}</label>)}</div>
            </fieldset>
            {method === "CASH" ? <>
              <label className="block space-y-1 text-sm"><span>Cash received (LKR)</span><input value={tendered} onChange={e => setTendered(e.target.value)} type="number" min="0" max={POS_MAX_CENTS / 100} step="0.01" inputMode="decimal" disabled={locked} className={field} /></label>
              <button type="button" disabled={locked || !cart.length} onClick={() => setTendered((total / 100).toFixed(2))} className="text-xs underline underline-offset-4 disabled:opacity-50">Exact cash</button>
              <div className="flex justify-between text-sm"><span>Change</span><strong>{validCash ? money(receivedCents - total) : "—"}</strong></div>
            </> : <>
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
