import { CURFOX_PORTAL_URL } from "@/app/_lib/curfox-portal";

export function PrintLabelLink({ waybill }: { waybill: string | null }) {
  if (!waybill) {
    return <span className="rounded-md border px-3 py-1 text-xs text-muted-foreground" title="Book courier first">🖨 Print label</span>;
  }
  return (
    <a href={CURFOX_PORTAL_URL} target="_blank" rel="noopener noreferrer"
       className="rounded-md border px-3 py-1 text-xs font-medium">
      🖨 Print label (Curfox) · {waybill}
    </a>
  );
}
