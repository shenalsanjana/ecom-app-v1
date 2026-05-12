// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/app/_lib/auth";

console.log("[Auth API]: Route module loading...");

export const runtime = "nodejs";
export const { GET, POST } = handlers;

console.log("[Auth API]: Handlers exported.");
