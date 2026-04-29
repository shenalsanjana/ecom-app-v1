// app/_data/orders-mock.ts
export type MockOrderItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
};

export type MockOrder = {
  id: string;
  placedAt: string;        // ISO date
  status: "delivered" | "shipped" | "processing";
  total: number;
  items: MockOrderItem[];
};

export const mockOrders: MockOrder[] = [
  {
    id: "ORD-1042",
    placedAt: "2026-04-12",
    status: "delivered",
    total: 289.49,
    items: [
      { productId: "p1", name: "Wireless Noise-Cancelling Headphones", price: 249.99, qty: 1 },
      { productId: "p4", name: "Hydrating Vitamin C Serum", price: 28.0, qty: 1 },
    ],
  },
  {
    id: "ORD-1058",
    placedAt: "2026-04-18",
    status: "delivered",
    total: 64.5,
    items: [{ productId: "p3", name: "Ceramic Pour-Over Coffee Set", price: 64.5, qty: 1 }],
  },
  {
    id: "ORD-1071",
    placedAt: "2026-04-22",
    status: "shipped",
    total: 129.99,
    items: [{ productId: "p5", name: "Trail Running Shoes", price: 129.99, qty: 1 }],
  },
  {
    id: "ORD-1085",
    placedAt: "2026-04-25",
    status: "shipped",
    total: 178.0,
    items: [
      { productId: "p7", name: "Smart Fitness Watch", price: 199.0, qty: 1 },
      { productId: "d4", name: "Yoga Mat Premium", price: 29.5, qty: 1 },
    ],
  },
  {
    id: "ORD-1097",
    placedAt: "2026-04-27",
    status: "processing",
    total: 34.0,
    items: [{ productId: "p6", name: "The Pragmatic Programmer", price: 34.0, qty: 1 }],
  },
  {
    id: "ORD-1103",
    placedAt: "2026-04-28",
    status: "processing",
    total: 138.97,
    items: [
      { productId: "d1", name: "Bluetooth Portable Speaker", price: 69.99, qty: 1 },
      { productId: "d2", name: "Cotton Crewneck Sweatshirt", price: 34.99, qty: 2 },
    ],
  },
];
