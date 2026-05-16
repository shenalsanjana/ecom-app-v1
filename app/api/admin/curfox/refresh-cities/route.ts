// app/api/admin/curfox/refresh-cities/route.ts
import { refreshCurfoxCityMap } from "@/app/_lib/courier/city-map";

// Uses Prisma → must run on the Node.js runtime (CLAUDE.md §3).
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.AUTH_SECRET;
  const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || provided !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { count } = await refreshCurfoxCityMap();
    return Response.json({ count });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh failed";
    console.error("[curfox] city-refresh failed:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
