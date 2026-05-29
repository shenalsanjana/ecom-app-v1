export type PaymentInitiationResponse = {
  provider?: "PAYHERE" | "KOKO" | "MINTPAY";
  displayName?: string;
  gatewayUrl?: string;
  fields?: Record<string, string>;
  error?: string;
};

export async function readPaymentInitiationResponse(
  response: Response,
): Promise<PaymentInitiationResponse> {
  const text = await response.text();
  if (!text) return { error: "Payment gateway returned an empty response" };
  try {
    return JSON.parse(text) as PaymentInitiationResponse;
  } catch {
    return { error: "Payment gateway returned an invalid response" };
  }
}

export function paymentErrorMessage(error?: string): string {
  const message = error?.trim() || "Payment gateway error";
  return `${message}. Your order is saved. Please try again or contact support.`;
}

export function submitPaymentCheckoutForm(gatewayUrl: string, fields: Record<string, string>): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = gatewayUrl;
  // `_top` forces navigation in the top-level browsing context (avoids the
  // gateway rendering inside an iframe with inner scrollbars).
  form.target = "_top";
  form.style.display = "none";
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

// Back-compat aliases (legacy PayHere-named imports still used in tests / elsewhere).
export type PayHerePaymentResponse = PaymentInitiationResponse;
export const readPayHerePaymentResponse = readPaymentInitiationResponse;
export const payHerePaymentErrorMessage = paymentErrorMessage;
export const submitPayHereCheckoutForm = submitPaymentCheckoutForm;
