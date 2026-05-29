import type { PaymentOrder } from "./types";

export function requireNameAndEmail(order: PaymentOrder): { name: string; email: string } {
  const name = order.guestName ?? order.user?.name;
  const email = order.guestEmail ?? order.user?.email;
  if (!name || !email) throw new Error("Order is missing customer name or email");
  return { name, email };
}
