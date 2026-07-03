/** Whether a customer-facing email should be attempted. Phone-only customers
 *  have no email (stored as "" by the OrderDetails convention). */
export function shouldEmailCustomer(email: string | null | undefined): boolean {
  return !!email && email.trim().length > 0;
}
