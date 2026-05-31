// app/_components/shared/installment-note.tsx
import { formatPrice } from "@/app/_lib/format";
import { installmentAmount, INSTALMENT_COUNT } from "@/app/_lib/installments";

type Props = { total: number; className?: string };

// "or 3 interest-free payments of Rs X with Koko / Mintpay"
export function InstallmentNote({ total, className }: Props) {
  if (total <= 0) return null;
  const per = installmentAmount(total);
  if (per <= 0) return null;

  return (
    <p className={"text-sm text-muted-foreground " + (className ?? "")}>
      or {INSTALMENT_COUNT} interest-free payments of{" "}
      <span className="font-medium text-foreground">{formatPrice(per)}</span> with{" "}
      <span className="font-medium text-brand">Koko</span> /{" "}
      <span className="font-medium text-brand">Mintpay</span>
    </p>
  );
}
