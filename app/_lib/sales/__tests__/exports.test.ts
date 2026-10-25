import { describe, expect, it } from "vitest";
import { calculateSales } from "../calculations";
import { salesRange } from "../range";
import { salesCsv, salesXlsx } from "../exports";
import { order } from "./fixtures";
const now = new Date("2026-10-24T08:00:00Z");
function report() { const paid = order(); paid.items[0].name = '=HYPERLINK("bad") & <Tote>'; return calculateSales([paid], [], salesRange({}, now), { placed: 1, pending: 0, pendingCents: 0, failed: 0, cancelled: 0, deliveredPaid: 0, paymentReview: 0 }, now); }
describe("sales downloads", () => {
  it("exports all report sections and protects CSV text from spreadsheet formulas", () => {
    const csv = salesCsv(report()); expect(csv).toContain("Payment received date"); expect(csv).toContain("Payment methods"); expect(csv).toContain("Collections"); expect(csv).toContain("1900");
    expect(csv).toContain('\'=HYPERLINK(""bad"")'); expect(csv).not.toContain('"=HYPERLINK');
  });
  it("generates an XLSX workbook with text cells, numeric amounts and no formulas", () => {
    const data = salesXlsx(report()); expect(data.subarray(0, 2).toString()).toBe("PK"); const text = data.toString();
    expect(text).toContain("xl/workbook.xml"); expect(text).toContain("worksheets/sheet7.xml"); expect(text).toContain('t="inlineStr"'); expect(text).toContain('=HYPERLINK(&quot;bad&quot;) &amp; &lt;Tote&gt;'); expect(text).not.toContain("<f>"); expect(text).toContain("<v>1900</v>");
  });
});
