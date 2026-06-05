// app/_components/shared/installment-note.tsx
import Image from "next/image";
import { formatPrice } from "@/app/_lib/format";
import { installmentAmount, INSTALMENT_COUNT } from "@/app/_lib/installments";

type Props = { total: number; className?: string };

const mintpayLogo = (
  <Image
    src="/payment/mintpay_name.png"
    alt="Mintpay"
    width={1200}
    height={628}
    className="ml-0.5 inline-block h-8 w-auto rounded-[3px] align-middle"
  />
);

const kokoLogo = (
  <Image
    src="/payment/koko.jpg"
    alt="Koko"
    width={52}
    height={24}
    className="ml-0.5 inline-block h-8 w-auto rounded-[3px] align-middle"
  />
);

// When Koko is enabled (NEXT_PUBLIC_KOKO_ENABLED):
//   "or pay in 3 × LKR X with [Koko] & [Mintpay] — or 8% Cashback with [Mintpay]"
// Both providers split into the same interest-free 3 × LKR X (display-only);
// only Mintpay offers the 8% cashback, so Koko is never shown with cashback.
// When Koko is disabled, falls back to the Mintpay-only note.
export function InstallmentNote({ total, className }: Props) {
  if (total <= 0) return null;
  const per = installmentAmount(total);
  if (per <= 0) return null;

  const kokoEnabled = process.env.NEXT_PUBLIC_KOKO_ENABLED === "true";
  const amount = <span className="font-medium text-foreground">{formatPrice(per)}</span>;
  const cashback = <span className="font-medium text-foreground">8% Cashback</span>;

  if (kokoEnabled) {
    return (
      <p className={"text-sm text-muted-foreground " + (className ?? "")}>
        or pay in {INSTALMENT_COUNT} × {amount} with {kokoLogo} &amp; {mintpayLogo} — or{" "}
        {cashback} with {mintpayLogo}
      </p>
    );
  }

  return (
    <p className={"text-sm text-muted-foreground " + (className ?? "")}>
      or pay in {INSTALMENT_COUNT} × {amount} or {cashback} with {mintpayLogo}
    </p>
  );
}
