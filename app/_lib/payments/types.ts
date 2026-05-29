export type OnlinePaymentMethod = "PAYHERE" | "KOKO" | "MINTPAY";
export type PaymentMethod = "COD" | OnlinePaymentMethod;

export type CheckoutPaymentOption = {
  id: PaymentMethod;
  name: string;
  description: string;
  icon: string;
};

export type PaymentInitResult = {
  provider: OnlinePaymentMethod;
  displayName: string;
  gatewayUrl: string;
  fields: Record<string, string>;
};

export type PaymentOrderItem = {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  size?: string | null;
};

export type PaymentOrder = {
  id: string;
  webNumber: string | null;
  total: number;
  subtotal: number;
  shippingCost: number;
  paymentMethod: string;
  paymentStatus: string | null;
  paymentMethodDisplay: string | null;
  customerPhone: string;
  guestName: string | null;
  guestEmail: string | null;
  shippingLine1: string;
  shippingLine2: string | null;
  shippingCity: string;
  shippingCountry: string;
  user: { name: string | null; email: string | null } | null;
  items: PaymentOrderItem[];
};

export type PaymentProvider = {
  method: OnlinePaymentMethod;
  displayName: string;
  initiate(order: PaymentOrder, baseUrl: string): Promise<PaymentInitResult>;
};
