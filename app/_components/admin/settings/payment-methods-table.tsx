import type { PaymentDiagnostic } from "@/app/_lib/payments/diagnostics";

function Badge({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ok ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>
      {ok ? yes : no}
    </span>
  );
}

export function PaymentMethodsTable({ rows }: { rows: PaymentDiagnostic[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Method</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Mode</th>
            <th className="px-4 py-2">Configured</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.method} className="border-t">
              <td className="px-4 py-2 font-medium">{r.label}</td>
              <td className="px-4 py-2"><Badge ok={r.enabled} yes="Enabled" no="Disabled" /></td>
              <td className="px-4 py-2">{r.mode ? <span className="uppercase">{r.mode}</span> : <span className="text-muted-foreground">—</span>}</td>
              <td className="px-4 py-2"><Badge ok={r.configured} yes="Yes" no="No" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        Read-only. Toggle providers via environment variables — credentials are never shown here.
      </p>
    </div>
  );
}
