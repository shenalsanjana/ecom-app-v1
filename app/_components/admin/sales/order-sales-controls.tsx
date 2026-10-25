"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordSalesRefund, voidSalesRefund, setHistoricalCosts } from "@/app/admin/sales/actions";
import { moneyInput } from "@/app/_lib/sales/input";
import { formatPrice } from "@/app/_lib/format";
import type { RefundInput } from "@/app/_lib/sales/refunds";
const field = "w-full rounded border bg-background px-2 py-1.5 text-sm disabled:opacity-50";
const localNow = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 16);
export type OrderSalesProps = { orderId: string; eligible: boolean; canReturn: boolean;
  items: { id: string; name: string; size: string | null; quantity: number; cost: number | null; remainingCents: number; remainingReturns: number }[];
  remainingShipping: number; refundedCents: number; history: { id: string; reference: string; amount: number; occurredAt: string; voided: boolean; reason: string }[] };
export function OrderSalesControls({ orderId, eligible, canReturn, items, remainingShipping, refundedCents, history }: OrderSalesProps) {
  const router = useRouter(), [pending, start] = useTransition();
  const [costs, setCosts] = useState<Record<string, string>>(() => Object.fromEntries(items.map(item => [item.id, item.cost === null ? "" : (item.cost / 100).toFixed(2)])));
  const [amounts, setAmounts] = useState<Record<string, string>>({}), [returns, setReturns] = useState<Record<string, string>>({});
  const [shipping, setShipping] = useState("0"), [reference, setReference] = useState(""), [reason, setReason] = useState(""), [occurredAt, setOccurredAt] = useState(localNow);
  const [verified, setVerified] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [intent, setIntent] = useState<RefundInput | null>(null), [operationKey, setOperationKey] = useState(() => crypto.randomUUID());
  function saveCosts() {
    setError(""); setMessage("");
    try {
      const values = items.map(item => ({ itemId: item.id, unitCostCents: moneyInput(costs[item.id] ?? "", true) }));
      start(async () => { try { const result = await setHistoricalCosts(orderId, values); if (!result.success) setError(result.error); else { setMessage("Historical costs saved."); router.refresh(); } } catch { setError("Could not save costs. Refresh and try again."); } });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Enter valid costs."); }
  }
  function saveRefund() {
    setError(""); setMessage("");
    try {
      const payload = intent ?? { operationKey, reference, reason, occurredAt: new Date(occurredAt + ":00+05:30").toISOString(), shippingCents: moneyInput(shipping || "0")!, verified: verified as true,
        items: items.map(item => ({ orderItemId: item.id, amountCents: moneyInput(amounts[item.id] || "0")!, returnedQuantity: Number(returns[item.id] || "0") })) };
      setIntent(payload);
      start(async () => {
        try {
          const result = await recordSalesRefund(orderId, payload);
          if (!result.success) { setError(result.error); if (!result.uncertain) setIntent(null); return; }
          setIntent(null); setOperationKey(crypto.randomUUID()); setAmounts({}); setReturns({}); setShipping("0"); setReference(""); setReason(""); setVerified(false); setOccurredAt(localNow());
          setMessage("Verified refund recorded. No funds or stock were changed by this recording."); router.refresh();
        } catch { setError("The record is awaiting confirmation. Retry the same details."); }
      });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Enter valid refund amounts and dates."); }
  }
  const locked = pending || !!intent;
  return <section aria-label="Sales accounting" className="space-y-3 rounded-lg border p-4 text-sm">
    <h2 className="font-semibold">Sales accounting</h2>
    <p>Recorded refunds: <strong>{formatPrice(refundedCents / 100)}</strong></p>
    <details><summary className="cursor-pointer font-medium">Product cost history</summary>
      <p className="my-2 text-xs text-muted-foreground">Record the actual unit cost for this order. Blank means unknown. These internal costs change gross profit reports; selling prices and inventory quantities stay as recorded.</p>
      <fieldset disabled={locked} className="space-y-3">{items.map(item => <label key={item.id} className="block space-y-1"><span>{item.name} · {item.size || "No size"} · {item.quantity} units</span><span className="block text-xs text-muted-foreground">Unit cost (LKR)</span><input aria-label={`Historical unit cost for ${item.id}`} inputMode="decimal" placeholder="Unknown" value={costs[item.id] ?? ""} onChange={event => setCosts(current => ({ ...current, [item.id]: event.target.value }))} className={field} /></label>)}
        <button type="button" onClick={saveCosts} className="rounded-md border px-3 py-2 disabled:opacity-50">Save historical costs</button>
      </fieldset>
    </details>
    <details><summary className="cursor-pointer font-medium">Record a completed refund</summary>
      <p className="my-2 text-xs text-muted-foreground">Process and verify the refund with the provider first, then record its reference here. Inventory returns are handled in Inventory; returned-to-stock units below mean resellable units already restocked. Delivery refunds do not reduce product profit.</p>
      {!eligible ? <p className="text-muted-foreground">Verified payment is required before recording a refund.</p> : <fieldset disabled={locked} className="space-y-3">
        <label className="block">Refund reference<input value={reference} onChange={event => setReference(event.target.value)} maxLength={120} className={field} /></label>
        <label className="block">Refund date and time (Sri Lanka)<input type="datetime-local" value={occurredAt} onChange={event => setOccurredAt(event.target.value)} className={field} /></label>
        {items.map(item => <div key={item.id} className="space-y-2 border-t pt-2"><p>{item.name} · {item.size || "No size"}<span className="block text-xs text-muted-foreground">Available to refund: {formatPrice(item.remainingCents / 100)}</span></p>
          <label className="block text-xs">Item refund (LKR)<input aria-label={`Refund amount for ${item.id}`} inputMode="decimal" value={amounts[item.id] ?? ""} placeholder="0.00" onChange={event => setAmounts(current => ({ ...current, [item.id]: event.target.value }))} className={field} /></label>
          {canReturn && <label className="block text-xs">Units already returned to stock<input aria-label={`Returned quantity for ${item.id}`} type="number" min={0} max={item.remainingReturns} step={1} value={returns[item.id] ?? ""} placeholder="0" onChange={event => setReturns(current => ({ ...current, [item.id]: event.target.value }))} className={field} /></label>}
        </div>)}
        <label className="block">Delivery refund (LKR)<input inputMode="decimal" value={shipping} onChange={event => setShipping(event.target.value)} className={field} /><span className="text-xs text-muted-foreground">Available: {formatPrice(remainingShipping / 100)}</span></label>
        <label className="block">Refund reason<input value={reason} onChange={event => setReason(event.target.value)} maxLength={500} className={field} /></label>
        <label className="flex items-start gap-2"><input type="checkbox" checked={verified} onChange={event => setVerified(event.target.checked)} /><span>I verified that this refund has already been completed.</span></label>
      </fieldset>}
      {eligible && <button type="button" disabled={pending || (!intent && (!verified || !reference.trim() || reason.trim().length < 3))} onClick={saveRefund} className="mt-3 rounded-md border px-3 py-2 disabled:opacity-50">{pending ? "Saving…" : intent ? "Retry refund record" : "Record verified refund"}</button>}
    </details>
    {!!history.length && <div className="space-y-2 border-t pt-3"><h3 className="font-medium">Recent refund records</h3>{history.map(refund => <div key={refund.id} className="rounded border p-2"><p className="break-words font-medium">{refund.reference} · {formatPrice(refund.amount / 100)} {refund.voided && "· Voided"}</p><p className="text-xs text-muted-foreground">{new Date(refund.occurredAt).toLocaleString("en-GB", { timeZone: "Asia/Colombo" })} SLT · {refund.reason}</p>
      {!refund.voided && <button type="button" disabled={locked} className="mt-1 underline disabled:opacity-50" onClick={() => { const note = window.prompt("Reason for voiding this reporting record (funds and stock are handled separately):"); if (!note) return; setError(""); start(async () => { try { const result = await voidSalesRefund(orderId, refund.id, note); if (!result.success) setError(result.error); else { setMessage("Refund reporting record voided."); router.refresh(); } } catch { setError("Could not void this record. Refresh and try again."); } }); }}>Void record</button>}
    </div>)}</div>}
    {error && <p role="alert" className="text-destructive">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
