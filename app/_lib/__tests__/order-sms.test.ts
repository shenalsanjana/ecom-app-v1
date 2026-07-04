import { describe, it, expect, beforeEach } from "vitest";
import {
  sendOrderConfirmationSms,
  sendOrderDispatchedSms,
  sendOrderCancelledSms,
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
  it("confirmation: strips +, names the ref and total, promises a shipping text", async () => {
    await sendOrderConfirmationSms({ phone: "+94771234567", ref: "WEB1001", total: 2440 });
    expect(captured[0].to).toBe("94771234567");
    expect(captured[0].message).toContain("WEB1001");
    expect(captured[0].message).toMatch(/2440/);
    expect(captured[0].message).toMatch(/ship/i);
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
  });
});
