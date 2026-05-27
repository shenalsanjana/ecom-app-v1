export type PayHerePaymentResponse = {
  gatewayUrl?: string;
  fields?: Record<string, string>;
  error?: string;
};

export async function readPayHerePaymentResponse(
  response: Response,
): Promise<PayHerePaymentResponse> {
  const text = await response.text();
  if (!text) {
    return { error: "Payment gateway returned an empty response" };
  }

  try {
    return JSON.parse(text) as PayHerePaymentResponse;
  } catch {
    return { error: "Payment gateway returned an invalid response" };
  }
}

export function payHerePaymentErrorMessage(error?: string): string {
  const message = error?.trim() || "Payment gateway error";
  return `${message}. Your order is saved. Please try again or contact support.`;
}

export function submitPayHereCheckoutForm(
  gatewayUrl: string,
  fields: Record<string, string>,
): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = gatewayUrl;
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
