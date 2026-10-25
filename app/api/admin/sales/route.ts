import { requireAdminApi } from "@/app/_lib/admin-auth";
import { readSalesReport, SalesBusyError, SalesRangeError } from "@/app/_lib/sales/service";
import { salesCsv, salesXlsx } from "@/app/_lib/sales/exports";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const guard = await requireAdminApi(); if (guard instanceof Response) return guard;
  const params = new URL(request.url).searchParams, format = params.get("format") ?? "json";
  if (!["json", "csv", "xlsx"].includes(format)) return Response.json({ error: "Choose CSV or Excel." }, { status: 400 });
  try {
    const report = await readSalesReport({ period: params.get("period") ?? undefined, start: params.get("start") ?? undefined, end: params.get("end") ?? undefined, channel: params.get("channel") ?? undefined });
    const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
    if (format === "json") return Response.json(report, { headers });
    const filename = `sales-${report.range.start}-${report.range.end}-${report.range.channel}.${format}`;
    return new Response(format === "csv" ? salesCsv(report) : new Uint8Array(salesXlsx(report)), { headers: { ...headers, "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` } });
  } catch (error) {
    if (error instanceof SalesRangeError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof SalesBusyError) return Response.json({ error: error.message }, { status: 503, headers: { "Retry-After": "5" } });
    console.error("[sales] Report read failed", { code: (error as { code?: string }).code });
    return Response.json({ error: "The sales report could not be updated. Try a shorter range or refresh shortly." }, { status: 503 });
  }
}
