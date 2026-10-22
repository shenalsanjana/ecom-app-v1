"use client";

export function PrintReceiptButton() {
  return <button onClick={() => window.print()} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Print receipt</button>;
}
