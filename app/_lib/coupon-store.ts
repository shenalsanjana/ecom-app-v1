"use client";
import { useSyncExternalStore } from "react";
let memoryCode = "";
const listeners = new Set<() => void>();
function readCoupon() {
  try { return sessionStorage.getItem("store-coupon") ?? memoryCode; }
  catch { return memoryCode; }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}
export function setCouponCode(value: string) {
  memoryCode = value.trim().toUpperCase();
  try { if (memoryCode) sessionStorage.setItem("store-coupon", memoryCode); else sessionStorage.removeItem("store-coupon"); }
  catch { /* Optional in private browsing. */ }
  listeners.forEach(listener => listener());
}
export function useCouponCode() { return useSyncExternalStore(subscribe, readCoupon, () => ""); }
