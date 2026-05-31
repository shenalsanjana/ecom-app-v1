// app/_components/shared/installment-note.tsx
import Image from "next/image";
import { formatPrice } from "@/app/_lib/format";
import { installmentAmount, INSTALMENT_COUNT } from "@/app/_lib/installments";

type Props = { total: number; className?: string };

// "or pay in 3 × LKR X or 6% Cashback with [Mintpay]"
export function InstallmentNote({ total, className }: Props) {
  if (total <= 0) return null;
  const per = installmentAmount(total);
  if (per <= 0) return null;

  return (
    <p className={"text-sm text-muted-foreground " + (className ?? "")}>
      or pay in {INSTALMENT_COUNT} ×{" "}
      <span className="font-medium text-foreground">{formatPrice(per)}</span> or{" "}
      <span className="font-medium text-foreground">6% Cashback</span> with{" "}
      <Image
        src="/payment/mintpay_name.png"
        alt="Mintpay"
        width={1200}
        height={628}
        className="ml-0.5 inline-block h-6 w-auto rounded-[3px] align-middle"
      />
    </p>
  );
}
