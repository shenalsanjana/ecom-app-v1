"use client";

import React, { createContext, useContext, useReducer, useEffect, useCallback } from "react";

export type CartItem = {
  key: string; // unique per (variantId, size)
  productId: string;
  variantId: string;
  color: string | null;
  size: string | null;
  name: string;
  price: number;
  image: string;
  quantity: number;
};

type CartState = {
  items: CartItem[];
  isLoading: boolean;
};

type AddItemPayload = Omit<CartItem, "quantity" | "key">;

type CartAction =
  | { type: "ADD_ITEM"; payload: AddItemPayload; quantity: number }
  | { type: "REMOVE_ITEM"; payload: string } // key
  | { type: "UPDATE_QUANTITY"; payload: { key: string; quantity: number } }
  | { type: "CLEAR_CART" }
  | { type: "LOAD_CART"; payload: CartItem[] };

type CartContextType = CartState & {
  addItem: (item: AddItemPayload, quantity?: number) => void;
  removeItem: (key: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
};

const CartContext = createContext<CartContextType | null>(null);

// Bumped from "shoply-cart-v2" → carts saved before variant-keyed items are
// silently discarded. They lacked variantId/color and would break checkout
// validation otherwise.
const STORAGE_KEY = "shoply-cart-v3";

const MAX_PER_LINE = 10;

function deriveKey(variantId: string, size: string | null): string {
  return size ? `${variantId}::${size}` : variantId;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD_ITEM": {
      const key = deriveKey(action.payload.variantId, action.payload.size);
      const qty = clamp(action.quantity, 1, MAX_PER_LINE);
      const existing = state.items.find((i) => i.key === key);
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.key === key
              ? { ...i, quantity: clamp(i.quantity + qty, 1, MAX_PER_LINE) }
              : i,
          ),
        };
      }
      return {
        ...state,
        items: [...state.items, { ...action.payload, key, quantity: qty }],
      };
    }
    case "REMOVE_ITEM":
      return {
        ...state,
        items: state.items.filter((i) => i.key !== action.payload),
      };
    case "UPDATE_QUANTITY":
      return {
        ...state,
        items: state.items.map((i) =>
          i.key === action.payload.key
            ? { ...i, quantity: clamp(action.payload.quantity, 0, MAX_PER_LINE) }
            : i,
        ),
      };
    case "CLEAR_CART":
      return { ...state, items: [] };
    case "LOAD_CART":
      return { ...state, items: action.payload, isLoading: false };
    default:
      return state;
  }
}

function isValidStoredItem(v: unknown): v is CartItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.key === "string" &&
    typeof o.productId === "string" &&
    typeof o.variantId === "string" &&
    (o.color === null || typeof o.color === "string") &&
    (o.size === null || typeof o.size === "string") &&
    typeof o.name === "string" &&
    typeof o.price === "number" &&
    typeof o.image === "string" &&
    typeof o.quantity === "number"
  );
}

const DEBUG_SEED_ITEMS: CartItem[] =
  process.env.NEXT_PUBLIC_DEBUG_CART === "1"
    ? [
        {
          key: "debug-variant::M",
          productId: "debug-product",
          variantId: "debug-variant",
          color: "White",
          size: "M",
          name: "Debug Tee",
          price: 1990,
          image: "/products/placeholder.svg",
          quantity: 2,
        },
      ]
    : [];

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, {
    items: DEBUG_SEED_ITEMS,
    isLoading: DEBUG_SEED_ITEMS.length === 0,
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.every(isValidStoredItem)) {
          dispatch({ type: "LOAD_CART", payload: parsed });
          return;
        }
      }
    } catch {
      // Invalid data, start fresh.
    }
    dispatch({ type: "LOAD_CART", payload: [] });
  }, []);

  useEffect(() => {
    if (!state.isLoading) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
      } catch {
        // Storage full or unavailable.
      }
    }
  }, [state.items, state.isLoading]);

  const addItem = useCallback((item: AddItemPayload, quantity: number = 1) => {
    dispatch({ type: "ADD_ITEM", payload: item, quantity });
  }, []);

  const removeItem = useCallback((key: string) => {
    dispatch({ type: "REMOVE_ITEM", payload: key });
  }, []);

  const updateQuantity = useCallback((key: string, quantity: number) => {
    if (quantity <= 0) {
      dispatch({ type: "REMOVE_ITEM", payload: key });
    } else {
      dispatch({ type: "UPDATE_QUANTITY", payload: { key, quantity } });
    }
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: "CLEAR_CART" });
  }, []);

  const totalItems = state.items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = state.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        ...state,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        subtotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextType {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
