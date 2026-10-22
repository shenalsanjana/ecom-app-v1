"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, TicketPercent, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatPrice } from "@/app/_lib/format";
import { DiscountInputSchema, type DiscountInput } from "@/app/_lib/discounts";
import { saveDiscount, setDiscountActive, deleteDiscount } from "@/app/admin/discounts/actions";
import { DISCOUNT_PAYMENT_METHODS, DISCOUNT_PAYMENT_LABELS, eligiblePaymentLabels } from "@/app/_lib/discount-payment-methods";

export type DiscountRow = DiscountInput & { id: string; version: number; usedCount: number; savings: number; paidOrders: number };
type Option = { id: string; name: string };
const empty: DiscountInput = { name: "", code: "", type: "PERCENTAGE", scope: "STORE", value: 10, active: false, publicOffer: false, paymentMethods: ["ALL"], startsAt: null, expiresAt: null, usageLimit: null, minimumOrder: 0, maximumDiscount: null, productIds: [], categorySlugs: [] };
const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const statuses = ["Active", "Scheduled", "Inactive", "Expired", "Limit reached"] as const;
function offerStatus(row: DiscountRow, now: number) {
  return !row.active ? "Inactive" : row.expiresAt && Date.parse(row.expiresAt) <= now ? "Expired" : row.startsAt && Date.parse(row.startsAt) > now ? "Scheduled" : row.usageLimit !== null && row.usedCount >= row.usageLimit ? "Limit reached" : "Active";
}
// Display and edit dates in Sri Lankan store time regardless of the admin device.
function localDate(iso: string | null) { return iso ? new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 16) : ""; }
function isoDate(local: string) { return local ? new Date(`${local}:00+05:30`).toISOString() : null; }
function displayDate(iso: string) { return new Date(iso).toLocaleString("en-LK", { timeZone: "Asia/Colombo" }); }

export function DiscountManager({ rows, products, categories, totals, asOf }: {
  rows: DiscountRow[]; products: Option[]; categories: Option[]; totals: { uses: number; savings: number; paid: number; active: number }; asOf: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<DiscountRow | null>(null);
  const [draft, setDraft] = useState<DiscountInput>(empty);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<DiscountRow | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [targetSearch, setTargetSearch] = useState("");
  const [error, setError] = useState("");
  const [dates, setDates] = useState({ startsAt: "", expiresAt: "" });
  function run(action: () => Promise<{ success: boolean; error?: string }>, message: string, done?: () => void) {
    setError("");
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.success) { setError(result.error ?? "Unable to save"); toast.error(result.error); return; }
        setError(""); done?.(); router.refresh(); toast.success(message);
      } catch { setError("Unable to save. Please try again."); toast.error("Unable to save. Please try again."); }
    });
  }
  function edit(row: DiscountRow | null) {
    setEditing(row);
    setDraft(row ?? { ...empty, productIds: [], categorySlugs: [] });
    setDates({ startsAt: localDate(row?.startsAt ?? null), expiresAt: localDate(row?.expiresAt ?? null) });
    setTargetSearch(""); setError(""); setOpen(true);
  }
  function submit() {
    let schedule: Pick<DiscountInput, "startsAt" | "expiresAt">;
    try {
      schedule = {
        startsAt: dates.startsAt === localDate(draft.startsAt) ? draft.startsAt : isoDate(dates.startsAt),
        expiresAt: dates.expiresAt === localDate(draft.expiresAt) ? draft.expiresAt : isoDate(dates.expiresAt),
      };
    }
    catch { setError("Enter valid start and expiry dates."); return; }
    const parsed = DiscountInputSchema.safeParse({ ...draft, ...schedule });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the offer details."); return; }
    run(() => saveDiscount(editing?.id ?? null, editing?.version ?? null, parsed.data), editing ? "Offer saved" : "Offer created", () => setOpen(false));
  }
  const filtered = rows.filter(r => `${r.name} ${r.code}`.toLowerCase().includes(search.trim().toLowerCase()) &&
    (statusFilter === "all" || offerStatus(r, asOf) === statusFilter) &&
    (kindFilter === "all" || (kindFilter === "coupon" ? !!r.code : !r.code)));
  const targets = draft.scope === "PRODUCTS" ? products : categories;
  const selected = draft.scope === "PRODUCTS" ? draft.productIds : draft.categorySlugs;
  const targetNames = new Map(targets.map(t => [t.id, t.name]));
  const matchingTargets = targets.filter(t => t.name.toLowerCase().includes(targetSearch.trim().toLowerCase()));
  const unavailableTargets = selected.filter(id => !targetNames.has(id));
  function updateTargets(next: string[]) { setDraft({ ...draft, ...(draft.scope === "PRODUCTS" ? { productIds: next } : { categorySlugs: next }) }); }
  const stats = [ ["Active offers", totals.active], ["Orders using offers", totals.uses], ["Customer savings", formatPrice(totals.savings)], ["Paid orders", totals.paid] ];
  return <div className="min-w-0 space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Discounts & coupons</h1><p className="mt-1 text-sm text-muted-foreground">Create offers, control availability, and track savings.</p></div><Button disabled={pending} onClick={() => edit(null)}><Plus className="mr-2 size-4" />Create offer</Button></div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{stats.map(([name, value]) => <div key={name} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{name}</p><p className="mt-2 text-xl font-semibold break-words">{value}</p></div>)}</div>
    <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">One offer per order. A coupon replaces automatic offers. Existing sale items are excluded. Limits count placed orders, including unpaid or cancelled orders; uses are never automatically restored.</div>
    <div className="flex flex-wrap gap-3">
      <Input aria-label="Search offers" type="search" placeholder="Search name or coupon code…" value={search} onChange={e => setSearch(e.target.value)} className="min-w-0 flex-1 sm:min-w-60" />
      <select aria-label="Filter offers by status" className={`${selectClass} sm:w-44`} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All statuses</option>{statuses.map(status => <option key={status} value={status}>{status}</option>)}</select>
      <select aria-label="Filter offers by type" className={`${selectClass} sm:w-44`} value={kindFilter} onChange={e => setKindFilter(e.target.value)}><option value="all">All offer types</option><option value="automatic">Automatic discounts</option><option value="coupon">Coupon codes</option></select>
    </div>
    <p role="status" className="text-xs text-muted-foreground">Showing {filtered.length} of {rows.length} offers</p>
    {error && !open && !deleting && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!filtered.length ? <div className="rounded-xl border border-dashed p-10 text-center"><TicketPercent className="mx-auto mb-3 size-9 text-muted-foreground" /><p>{rows.length ? "No offers match your filters" : "No offers yet"}</p>{rows.length ? <Button variant="outline" className="mt-4" onClick={() => { setSearch(""); setStatusFilter("all"); setKindFilter("all"); }}>Clear filters</Button> : <Button variant="outline" className="mt-4" disabled={pending} onClick={() => edit(null)}>Create an offer</Button>}</div> : <div className="grid gap-4 xl:grid-cols-2">{filtered.map(row => {
      const status = offerStatus(row, asOf);
      return <article key={row.id} className="min-w-0 rounded-xl border bg-card p-5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold">{row.name}</h2><p className="mt-1 text-sm text-muted-foreground">{row.type === "PERCENTAGE" ? `${row.value}% off` : `${formatPrice(row.value)} off`} · {row.scope === "STORE" ? "Entire store" : row.scope === "PRODUCTS" ? `${row.productIds.length} products` : `${row.categorySlugs.length} collections`}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-xs ${status === "Active" ? "bg-green-100 text-green-900" : "bg-muted text-muted-foreground"}`}>{status}</span></div>
        <p className="mt-4 break-all rounded-md bg-muted px-3 py-2 font-mono text-sm">{row.code || "Automatic discount"}</p>
        <p className="mt-2 text-xs text-muted-foreground">{row.code ? row.publicOffer ? "Public coupon · advertised while available" : "Private coupon · shared by code only" : "Automatic offer · shown on eligible products while available"}</p>
        <p className="mt-2 text-xs text-muted-foreground">Payments: {row.paymentMethods?.includes("ALL") ? "All payment methods" : eligiblePaymentLabels(row)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><p><span className="block text-xs text-muted-foreground">Uses / limit</span>{row.usedCount} / {row.usageLimit ?? "Unlimited"}</p><p><span className="block text-xs text-muted-foreground">Savings</span>{formatPrice(row.savings)}</p><p><span className="block text-xs text-muted-foreground">Paid orders</span>{row.paidOrders}</p><p><span className="block text-xs text-muted-foreground">Minimum order</span>{formatPrice(row.minimumOrder)}</p><p><span className="block text-xs text-muted-foreground">Maximum discount</span>{row.maximumDiscount === null ? "No cap" : formatPrice(row.maximumDiscount)}</p></div>
        <div className="mt-3 space-y-1 text-xs text-muted-foreground"><p>{row.startsAt ? `Starts ${displayDate(row.startsAt)} (Sri Lanka)` : "No start date"}</p><p>{row.expiresAt ? `Expires ${displayDate(row.expiresAt)} (Sri Lanka)` : "No expiry"}</p></div>
        <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={pending} aria-label={`${row.active ? "Deactivate" : "Activate"} ${row.name}`} onClick={() => run(() => setDiscountActive(row.id, row.version, !row.active), row.active ? "Offer deactivated" : "Offer activated")}>{row.active ? "Deactivate" : "Activate"}</Button><Button size="sm" variant="ghost" disabled={pending} aria-label={`Edit ${row.name}`} onClick={() => edit(row)}><Pencil className="mr-1 size-3" />Edit</Button><Button size="sm" variant="ghost" disabled={pending} aria-label={`Delete ${row.name}`} onClick={() => { setError(""); setDeleting(row); }}><Trash2 className="mr-1 size-3" />Delete</Button></div>
      </article>;
    })}</div>}
    <Dialog open={open} onOpenChange={v => { if (!pending) setOpen(v); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editing ? "Edit offer" : "Create offer"}</DialogTitle><DialogDescription>Values are in LKR. Dates use Sri Lanka time (UTC+05:30).</DialogDescription></DialogHeader>
      <form onSubmit={e => { e.preventDefault(); submit(); }} className="space-y-4">
        <fieldset disabled={pending} className="space-y-4 disabled:opacity-70">
        <div className="space-y-2"><Label htmlFor="offer-name">Offer name</Label><Input id="offer-name" required maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="offer-code">Coupon code (leave empty for automatic)</Label><Input id="offer-code" maxLength={40} value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value.toUpperCase() })} /></div>
        {draft.code.trim() ? <div className="rounded-md border p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.publicOffer ?? false} onChange={e => setDraft({ ...draft, publicOffer: e.target.checked })} />Advertise this coupon on the website</label><p className="mt-1 text-xs text-muted-foreground">Off by default for private codes. Available store-wide offers may appear in the homepage banner; eligible products show the code and conditions.</p></div> : <p className="text-xs text-muted-foreground">Available automatic offers appear on eligible products. Store-wide offers also appear in the website promotion banner.</p>}
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="offer-type">Discount type</Label><select id="offer-type" className={selectClass} value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value as DiscountInput["type"] })}><option value="PERCENTAGE">Percentage (%)</option><option value="FIXED">Fixed amount (LKR)</option></select></div><div className="space-y-2"><Label htmlFor="offer-value">{draft.type === "PERCENTAGE" ? "Percentage" : "Amount (LKR)"}</Label><Input id="offer-value" type="number" min="0.01" max={draft.type === "PERCENTAGE" ? 100 : 10000000} step="0.01" required value={draft.value} onChange={e => setDraft({ ...draft, value: Number(e.target.value) })} /></div></div>
        <div className="space-y-2"><Label htmlFor="offer-scope">Applies to</Label><select id="offer-scope" className={selectClass} value={draft.scope} onChange={e => { setTargetSearch(""); setDraft({ ...draft, scope: e.target.value as DiscountInput["scope"] }); }}><option value="STORE">Entire store</option><option value="PRODUCTS">Specific products</option><option value="CATEGORIES">Store collections (categories)</option></select></div>
        {draft.scope !== "STORE" && <div className="space-y-2">
          <Input aria-label="Search offer targets" type="search" placeholder="Search…" value={targetSearch} onChange={e => setTargetSearch(e.target.value)} />
          <p className="text-xs text-muted-foreground">{selected.length} selected</p>
          {!!selected.length && <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">{selected.map(id => <Button key={id} type="button" size="sm" variant="outline" className="max-w-full" aria-label={`Remove ${targetNames.get(id) ?? id}`} onClick={() => updateTargets(selected.filter(value => value !== id))}><span className="truncate">{targetNames.get(id) ?? `Unavailable: ${id}`}</span><X className="ml-1 size-3 shrink-0" /></Button>)}</div>}
          {!!unavailableTargets.length && <p role="alert" className="text-xs text-destructive">Remove unavailable selections before saving. Archived products cannot be added to offers.</p>}
          <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border p-3">{matchingTargets.length ? matchingTargets.map(t => <label key={t.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(t.id)} onChange={e => updateTargets(e.target.checked ? [...new Set([...selected, t.id])] : selected.filter(id => id !== t.id))} />{t.name}</label>) : <p className="text-sm text-muted-foreground">No {draft.scope === "PRODUCTS" ? "products" : "collections"} found.</p>}</div>
        </div>}
        <div className="grid gap-4 sm:grid-cols-2">{([ ["startsAt", "Starts at"], ["expiresAt", "Expires at"] ] as const).map(([key, label]) => <div key={key} className="space-y-2"><Label htmlFor={key}>{label}</Label><Input id={key} type="datetime-local" value={dates[key]} onChange={e => setDates({ ...dates, [key]: e.target.value })} /></div>)}</div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="offer-min">Minimum order (LKR)</Label><Input id="offer-min" type="number" min="0" max="10000000" step="0.01" value={draft.minimumOrder} onChange={e => setDraft({ ...draft, minimumOrder: Number(e.target.value) })} /></div><div className="space-y-2"><Label htmlFor="offer-max">Maximum discount (LKR, optional)</Label><Input id="offer-max" type="number" min="0.01" max="10000000" step="0.01" value={draft.maximumDiscount ?? ""} onChange={e => setDraft({ ...draft, maximumDiscount: e.target.value ? Number(e.target.value) : null })} /></div></div>
        <div className="space-y-2"><Label htmlFor="offer-limit">Total usage limit (optional)</Label><Input id="offer-limit" type="number" min={Math.max(1, editing?.usedCount ?? 1)} max="2000000000" step="1" value={draft.usageLimit ?? ""} onChange={e => setDraft({ ...draft, usageLimit: e.target.value ? Number(e.target.value) : null })} /></div>
        <fieldset className="space-y-3 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">Eligible payment methods</legend>
          <label className="flex items-center gap-2 text-sm"><input id="offer-payments-all" type="checkbox" checked={(draft.paymentMethods ?? ["ALL"]).includes("ALL")} onChange={e => setDraft({ ...draft, paymentMethods: e.target.checked ? ["ALL"] : [] })} />All payment methods</label>
          <div className="grid gap-3 sm:grid-cols-2">{DISCOUNT_PAYMENT_METHODS.map(method => <label key={method} className="flex items-center gap-2 text-sm"><input id={`offer-payment-${method}`} type="checkbox" checked={draft.paymentMethods?.includes(method) ?? false} onChange={e => setDraft({ ...draft, paymentMethods: e.target.checked ? [...new Set([...(draft.paymentMethods ?? []).filter(value => value !== "ALL"), method])] : (draft.paymentMethods ?? []).filter(value => value !== method) })} />{DISCOUNT_PAYMENT_LABELS[method]}</label>)}</div>
          <p className="text-xs text-muted-foreground">Choose All payment methods, or select one or more methods. Restricted offers show their conditions before checkout and apply only with a matching payment method.</p>
        </fieldset>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} />Active</label>
        </fieldset>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending || (draft.scope !== "STORE" && unavailableTargets.length > 0)}>{pending ? "Saving…" : "Save offer"}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={v => { if (!v && !pending) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>Delete {deleting?.name}?</DialogTitle><DialogDescription>This removes the offer. Existing orders and redemption history are preserved.</DialogDescription></DialogHeader>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" disabled={pending} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={pending} onClick={() => { if (deleting) run(() => deleteDiscount(deleting.id, deleting.version), "Offer deleted", () => setDeleting(null)); }}>{pending ? "Deleting…" : "Delete offer"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
