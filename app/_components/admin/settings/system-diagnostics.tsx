import type { SystemDiagnostics } from "@/app/_lib/payments/diagnostics";

export function SystemDiagnosticsPanel({ data }: { data: SystemDiagnostics }) {
  return (
    <dl className="grid grid-cols-1 gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-xs uppercase text-muted-foreground">Environment</dt>
        <dd className="font-medium">{data.nodeEnv}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase text-muted-foreground">App URL</dt>
        <dd className="font-medium break-all">{data.appUrl}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="mb-1 text-xs uppercase text-muted-foreground">Providers</dt>
        <dd className="flex flex-wrap gap-2">
          {data.providers.map((p) => (
            <span key={p.method} className="rounded-md border px-2 py-1 text-xs">
              {p.method}: {p.mode ?? "—"} · {p.configured ? "configured" : "not configured"}
            </span>
          ))}
        </dd>
      </div>
    </dl>
  );
}
