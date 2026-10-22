"use client";
import { useRef } from "react";

/** Reuse an intent after a lost response; a successful receipt starts a new one. */
export function useStockOperation() {
  const intent = useRef<{ payload: string; key: string } | null>(null);
  return {
    keyFor(payload: unknown): string {
      const value = JSON.stringify(payload);
      if (intent.current?.payload !== value) intent.current = { payload: value, key: crypto.randomUUID() };
      return intent.current!.key;
    },
    complete() { intent.current = null; },
  };
}
