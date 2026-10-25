export function moneyInput(value: string, optional = false): number | null {
  const text = value.trim();
  if (!text && optional) return null;
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(text)) throw new Error("Enter an LKR amount with at most two decimal places.");
  const amount = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2_000_000_000) throw new Error("The amount is outside the supported range.");
  return amount;
}
