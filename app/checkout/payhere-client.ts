export type PayHerePaymentResponse = {
  paymentUrl?: string;
  paymentId?: string;
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
