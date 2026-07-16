// app/api/health/route.ts
//
// Unauthenticated liveness/readiness check for the Docker HEALTHCHECK and
// Compose's `depends_on: condition: service_healthy`. Deliberately returns
// no error detail (no stack trace, no DB error message) — unlike
// app/api/debug-db/route.ts, which is a separate, pre-existing endpoint out
// of scope for this change.
import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/prisma";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
