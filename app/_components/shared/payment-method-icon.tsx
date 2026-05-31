import Image from "next/image";
import { Banknote, CreditCard } from "lucide-react";

// Renders the brand mark / icon for a checkout payment method.
// Koko & Mintpay use their real logos; Card (PAYHERE) and COD use line icons.
export function PaymentMethodIcon({ method }: { method: string }) {
  if (method === "KOKO") {
    return (
      <Image src="/payment/koko.jpg" alt="Koko" width={52} height={24} className="object-contain" />
    );
  }
  if (method === "MINTPAY") {
    return (
      <Image src="/payment/mintpay.png" alt="Mintpay" width={28} height={28} className="rounded object-contain" />
    );
  }
  if (method === "COD") {
    return <Banknote className="h-5 w-5 text-muted-foreground" aria-hidden />;
  }
  // PAYHERE / card
  return <CreditCard className="h-5 w-5 text-muted-foreground" aria-hidden />;
}
