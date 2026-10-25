import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), read: vi.fn(), csv: vi.fn(), xlsx: vi.fn() }));
vi.mock("@/app/_lib/admin-auth", () => ({ requireAdminApi: mocks.guard }));
vi.mock("@/app/_lib/sales/service", () => ({ readSalesReport: mocks.read, SalesRangeError: class extends Error {}, SalesBusyError: class extends Error {} }));
vi.mock("@/app/_lib/sales/exports", () => ({ salesCsv: mocks.csv, salesXlsx: mocks.xlsx }));
import { GET } from "@/app/api/admin/sales/route";
import { SalesRangeError, SalesBusyError } from "../service";
describe("admin sales report endpoint", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.guard.mockResolvedValue({ user: { role: "ADMIN" } }); mocks.read.mockResolvedValue({ range: { start: "2026-02-01", end: "2026-02-01", channel: "ALL" } }); });
  it.each([401, 403])("guards reads and downloads before accessing data (%i)", async status => {
    mocks.guard.mockResolvedValue(new Response("Denied", { status }));
    expect((await GET(new Request("http://localhost/api/admin/sales?format=xlsx"))).status).toBe(status);
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.xlsx).not.toHaveBeenCalled();
  });
  it("validates the output format and keeps JSON private", async () => {
    expect((await GET(new Request("http://localhost/api/admin/sales?format=html"))).status).toBe(400); expect(mocks.read).not.toHaveBeenCalled();
    const response = await GET(new Request("http://localhost/api/admin/sales?period=custom&start=2026-02-01&end=2026-02-01&channel=POS"));
    expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.read).toHaveBeenCalledWith({ period: "custom", start: "2026-02-01", end: "2026-02-01", channel: "POS" });
  });
  it.each(["csv", "xlsx"])("downloads %s with attachment headers", async format => {
    mocks.csv.mockReturnValue("CSV"); mocks.xlsx.mockReturnValue(Buffer.from("Excel"));
    const response = await GET(new Request(`http://localhost/api/admin/sales?format=${format}`));
    expect(response.headers.get("content-disposition")).toContain(`sales-2026-02-01-2026-02-01-ALL.${format}`);
    expect(await response.text()).toBe(format === "csv" ? "CSV" : "Excel");
  });
  it("returns useful range and busy errors without database details", async () => {
    mocks.read.mockRejectedValueOnce(new SalesRangeError("Narrow the dates"));
    expect((await GET(new Request("http://localhost/api/admin/sales"))).status).toBe(400);
    mocks.read.mockRejectedValueOnce(new SalesBusyError("Retry shortly"));
    const busy = await GET(new Request("http://localhost/api/admin/sales")); expect(busy.status).toBe(503); expect(busy.headers.get("retry-after")).toBe("5");
  });
});
