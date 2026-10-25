import * as zlib from "node:zlib";
import type { Breakdown, Metric, SalesReport } from "./calculations";

type Cell = string | number | null;
type Sheet = { name: string; rows: Cell[][] };
const headers = ["Name", "Paid orders", "Units sold", "Units returned", "Gross sales (LKR)", "Discounts (LKR)", "Additional charges (LKR)", "Net sales (LKR)", "Net delivery (LKR)", "Revenue (LKR)", "Recorded refunds (LKR)", "Cancelled-order refunds (LKR)", "Product cost (LKR)", "Recovered cost (LKR)", "Gross profit (LKR)", "Units with unknown cost"];
const amount = (value: number | null) => value === null ? null : value / 100;
function metric(name: string, row: Metric): Cell[] { return [name, row.orders, row.units, row.returnedUnits, amount(row.grossCents), amount(row.discountCents), amount(row.chargeCents), amount(row.netSalesCents), amount(row.shippingCents), amount(row.revenueCents), amount(row.refundCents), amount(row.cancelledRefundCents), amount(row.costCents), amount(row.recoveredCostCents), amount(row.profitCents), row.missingCostUnits]; }
function sheets(report: SalesReport): Sheet[] {
  const group = (name: string, rows: Breakdown[]) => ({ name, rows: [headers, ...rows.map(row => metric(row.name, row))] });
  return [{ name: "Summary", rows: [
    ["Sales report", "Payment received date · Asia/Colombo"], ["From", report.range.start], ["To (inclusive)", report.range.end], ["Channel", report.range.channel], ["Updated", report.generatedAt], [], headers, metric("Total", report.totals), [],
    ["Orders placed in range (excludes cancelled)", report.status.placed], ["Pending orders placed in range", report.status.pending], ["Pending value (LKR)", report.status.pendingCents / 100], ["Delivered paid orders", report.status.deliveredPaid], ["Cancelled orders excluded", report.status.cancelled],
    ["Historical payment dates estimated", report.quality.estimatedPaidDates], ["Historical price markdowns unavailable (orders)", report.quality.legacyPriceOrders],
    ["Definitions", "Revenue includes net delivery. Net sales and gross profit exclude delivery. Cancelled-order refunds are reported separately and do not reduce sales twice. Unknown costs leave profit blank. Older unrecorded markdowns/refunds are not inferred."],
  ] }, group("Daily", report.daily), group("Channels", report.channels), group("Payment methods", report.payments), group("Products", report.products), group("Collections", report.categories), group("Sizes", report.sizes)];
}
export function salesCsv(report: SalesReport): string {
  const csv = (value: Cell) => {
    let text = value === null ? "" : String(value);
    if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return "\uFEFF" + sheets(report).flatMap(sheet => [[sheet.name], ...sheet.rows, []]).map(row => row.map(csv).join(",")).join("\r\n");
}
function xml(value: string) { return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, 32767).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function col(index: number) { let value = ""; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) value = String.fromCharCode(65 + (n - 1) % 26) + value; return value; }
// Minimal standards-based XLSX ZIP with inline text cells: no formulas, macros or external links.
function crc32(data: Buffer) { const native = (zlib as typeof zlib & { crc32?: (data: Buffer) => number }).crc32; if (native) return native(data); let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function zip(files: { name: string; text: string }[]): Buffer {
  const local: Buffer[] = [], directory: Buffer[] = []; let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name), data = Buffer.from(file.text), crc = crc32(data), head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x800, 6); head.writeUInt16LE(33, 12); head.writeUInt32LE(crc, 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(name.length, 26);
    local.push(head, name, data);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8); entry.writeUInt16LE(33, 14); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42);
    directory.push(entry, name); offset += head.length + name.length + data.length;
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, central, end]);
}
export function salesXlsx(report: SalesReport): Buffer {
  const list = sheets(report), prefix = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const files = [
    { name: "[Content_Types].xml", text: prefix + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") + '</Types>' },
    { name: "_rels/.rels", text: prefix + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: "xl/workbook.xml", text: prefix + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + list.map((sheet, i) => `<sheet name="${xml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") + '</sheets></workbook>' },
    { name: "xl/_rels/workbook.xml.rels", text: prefix + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") + '</Relationships>' },
    ...list.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, text: prefix + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetData>' + sheet.rows.map((row, r) => `<row r="${r + 1}">` + row.map((value, c) => value === null ? "" : typeof value === "number" ? `<c r="${col(c)}${r + 1}"><v>${Number.isInteger(value) ? value : value.toFixed(2)}</v></c>` : `<c r="${col(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join("") + '</row>').join("") + '</sheetData></worksheet>' })),
  ];
  return zip(files);
}
