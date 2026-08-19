import { describe, it, expect } from "vitest";
import { marqueeMessages } from "./marquee";

describe("marqueeMessages", () => {
  it("returns exactly four messages in the specified order", () => {
    const msgs = marqueeMessages(5000, true);
    expect(msgs.map((m) => m.key)).toEqual([
      "shipping",
      "installments",
      "cod",
      "drops",
    ]);
  });

  it("names a threshold when free shipping is conditional", () => {
    const [shipping] = marqueeMessages(5000, true);
    expect(shipping.text).toContain("Free shipping over");
    expect(shipping.text).toContain("5,000");
  });

  it("switches to the unconditional wording at a zero threshold", () => {
    const [shipping] = marqueeMessages(0, true);
    expect(shipping.text).toContain("Free shipping on everything");
    expect(shipping.text).not.toContain("over");
  });

  it("carries the exclusion note so it cannot drift from cart and checkout", () => {
    expect(marqueeMessages(5000, true)[0].text).toContain("excludes Koko & Mintpay");
    expect(marqueeMessages(5000, false)[0].text).toContain("excludes Mintpay");
  });

  it("names Koko in the installments line only when Koko is enabled", () => {
    expect(marqueeMessages(5000, true)[1].text).toBe(
      "Pay in 3 interest-free — Koko & Mintpay",
    );
    expect(marqueeMessages(5000, false)[1].text).toBe(
      "Pay in 3 interest-free — Mintpay",
    );
  });

  it("keeps the two static messages verbatim", () => {
    const msgs = marqueeMessages(5000, true);
    expect(msgs[2].text).toBe("Cash on Delivery island-wide");
    expect(msgs[3].text).toBe("New drops every week");
  });

  it("gives every message a unique key so React lists are stable", () => {
    const keys = marqueeMessages(5000, true).map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
