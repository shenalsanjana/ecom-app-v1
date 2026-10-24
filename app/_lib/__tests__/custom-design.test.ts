import { describe, expect, it } from "vitest";
import { BUSINESS_WHATSAPP_NUMBER, customDesignSummary, designWhatsAppUrl } from "../custom-design";

describe("custom design WhatsApp handoff", () => {
  it("addresses Business WhatsApp and safely encodes product names, links and PNG instructions", () => {
    const name = "Logo & name 🐻 + 50%";
    const link = "https://www.dressingbear.com/products/custom-bag?color=ivory";
    const url = new URL(designWhatsAppUrl([{ name, url: link }]));
    expect(url.origin + url.pathname).toBe(`https://wa.me/${BUSINESS_WHATSAPP_NUMBER}`);
    expect(url.searchParams.get("text")).toContain(name);
    expect(url.searchParams.get("text")).toContain(link);
    expect(url.searchParams.get("text")).toContain("PNG");
  });
  it("includes the order reference and deduplicates repeated product entries", () => {
    const message = new URL(designWhatsAppUrl([{ name: "Custom Tote" }, { name: "Custom Tote" }], "WEB0042")).searchParams.get("text")!;
    expect(message).toContain("WEB0042");
    expect(message.match(/Custom Tote/g)).toHaveLength(1);
  });
  it("keeps a large order's message bounded while retaining its order reference", () => {
    const message = new URL(designWhatsAppUrl(Array.from({ length: 25 }, (_, index) => ({ name: `Design ${index}` })), "WEB9")).searchParams.get("text")!;
    expect(message).toContain("WEB9");
    expect(message).toContain("5 other customized products");
  });
  it("requires admin-confirmed receipt for every custom item, including deleted products", () => {
    const rows = [{ name: "Normal", isCustomizedDesign: false },
      { name: "Tote", isCustomizedDesign: true, designReceivedAt: new Date() },
      { name: "Deleted pouch", productId: null, isCustomizedDesign: true, designReceivedAt: null }];
    expect(customDesignSummary(rows).customized).toHaveLength(2);
    expect(customDesignSummary(rows).pending.map(item => item.name)).toEqual(["Deleted pouch"]);
    expect(customDesignSummary([{ name: "Normal" }]).pending).toEqual([]);
  });
});
