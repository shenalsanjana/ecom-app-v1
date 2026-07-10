import { describe, it, expect, beforeEach } from "vitest";
import {
  sendOrderConfirmationSms,
  sendOrderDispatchedSms,
  sendOrderCancelledSms,
  buildConfirmationItemSummary,
  __setTestSmsSender,
} from "../sms";

let captured: { to: string; message: string }[];
beforeEach(() => {
  captured = [];
  __setTestSmsSender(async (to, message) => {
    captured.push({ to, message });
  });
});

describe("order SMS templates", () => {
  it("summary: gives color suffixes priority over colorless product-name expansion", () => {
    const summary = buildConfirmationItemSummary([
      { name: "Colorless Long Product Name", color: null },
      { name: "Premium Shirt", color: "Iridescent Purple" },
    ], 24);

    expect(summary.length).toBeLessThanOrEqual(24);
    expect(summary).toBe("C, P (Iridescent Purple)");
  });

  it("summary: never exceeds a tiny budget or emits partial item structure", () => {
    const summary = buildConfirmationItemSummary([
      { name: "Cat Tee", color: "Red" },
      { name: "Dino Tee", color: "Blue" },
      { name: "Bear Cap", color: "Green" },
    ], 5);

    expect(summary.length).toBeLessThanOrEqual(5);
    expect(summary).not.toMatch(/[()]/);
  });

  it("confirmation: strips +, names the ref and total, promises a shipping text", async () => {
    await sendOrderConfirmationSms({ phone: "+94771234567", ref: "WEB1001", total: 2440, items: [{ name: "Cat Tee", color: "White" }] });
    expect(captured[0].to).toBe("94771234567");
    expect(captured[0].message).toContain("WEB1001");
    expect(captured[0].message).toMatch(/2440/);
    expect(captured[0].message).toMatch(/ship/i);
  });

  it("confirmation: includes up to two product-color pairs and counts omitted lines", async () => {
    await sendOrderConfirmationSms({ phone: "+94771234567", ref: "WEB1001", total: 6240, items: [
      { name: "Cat Tee", color: "White" }, { name: "Dino Tee", color: "Pink" }, { name: "Bear Cap", color: "Blue" },
    ] });
    expect(captured[0].message).toContain("Cat Tee (White)");
    expect(captured[0].message).toContain("Dino Tee (Pink)");
    expect(captured[0].message).toContain("+1 more");
    expect(captured[0].message).not.toContain("Bear Cap");
  });

  it("confirmation: keeps the message within 160 characters while preserving included colors", async () => {
    await sendOrderConfirmationSms({ phone: "+94771234567", ref: "WEB1001", total: 987654, items: [
      { name: "Very Long Premium Cotton Graphic Oversized Cat T-Shirt", color: "White" },
      { name: "Another Very Long Premium Cotton Graphic Oversized Dino T-Shirt", color: "Pink" },
      { name: "Bear Cap", color: "Blue" },
    ] });
    expect(captured[0].message.length).toBeLessThanOrEqual(160);
    expect(captured[0].message).toContain("(White)");
    expect(captured[0].message).toContain("(Pink)");
    expect(captured[0].message).toContain("+1 more");
  });

  it("confirmation: shortens product names before long included colors", async () => {
    await sendOrderConfirmationSms({
      phone: "+94771234567",
      ref: "WEB1001",
      total: 2440,
      items: [
        { name: "Extremely Long Premium Cotton Cat T-Shirt", color: "Limited Edition Iridescent Purple" },
        { name: "Cap", color: "Red" },
      ],
    });

    expect(captured[0].message.length).toBeLessThanOrEqual(160);
    expect(captured[0].message).toContain("(Limited Edition Iridescent Purple)");
    expect(captured[0].message).toContain("Cap (Red)");
    expect(captured[0].message).not.toContain("Extremely Long Premium Cotton Cat T-Shirt");
  });

  it("confirmation: keeps long-color summaries structurally valid and preserves omitted count", async () => {
    await sendOrderConfirmationSms({
      phone: "+94771234567",
      ref: "WEB1001",
      total: 987654,
      items: [
        { name: "Premium Cat Shirt", color: "Extraordinary Limited Edition Iridescent Purple and Gold" },
        { name: "Premium Dino Shirt", color: "Exclusive Hand Dyed Fluorescent Turquoise and Magenta" },
        { name: "Bear Cap", color: "Blue" },
      ],
    });

    const message = captured[0].message;
    expect(message.length).toBeLessThanOrEqual(160);
    expect(message).toContain("+1 more");
    expect(message.match(/\(/g)?.length).toBe(2);
    expect(message.match(/\)/g)?.length).toBe(2);
    expect(message).toMatch(/confirmed\. [^()]+ \([^()]+\), [^()]+ \([^()]+\) \+1 more\./);
  });

  it("dispatched: names the ref, carrier, and tracking code", async () => {
    await sendOrderDispatchedSms({
      phone: "+94771234567",
      ref: "WEB1001",
      trackingCode: "RA123",
      carrier: "Royal Express",
    });
    expect(captured[0].message).toContain("WEB1001");
    expect(captured[0].message).toContain("Royal Express");
    expect(captured[0].message).toContain("RA123");
  });

  it("cancelled: names the ref and a contact number", async () => {
    await sendOrderCancelledSms({ phone: "+94771234567", ref: "WEB1001" });
    expect(captured[0].message).toContain("WEB1001");
    expect(captured[0].message).toMatch(/cancel/i);
    expect(captured[0].message).toMatch(/call/i);
  });
});
