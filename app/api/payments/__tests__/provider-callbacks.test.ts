import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

const { finalizePaidPayment, finalizeFailedPayment, fetchKokoOrderStatus } = vi.hoisted(() => ({
  finalizePaidPayment: vi.fn(async () => ({ status: "success" })),
  finalizeFailedPayment: vi.fn(async () => ({ status: "failed" })),
  fetchKokoOrderStatus: vi.fn(),
}));

vi.mock("@/app/_lib/payments/order-finalization", () => ({
  finalizePaidPayment,
  finalizeFailedPayment,
}));

vi.mock("@/app/_lib/payments/koko", () => ({
  fetchKokoOrderStatus,
}));

describe("provider callback routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MINTPAY_MERCHANT_ID = "mp0001";
    process.env.MINTPAY_MERCHANT_SECRET = "secret";
    finalizePaidPayment.mockResolvedValue({ status: "success" });
    finalizeFailedPayment.mockResolvedValue({ status: "failed" });
  });

  // ---------- Mintpay ----------
  it("finalizes Mintpay success when HMAC is valid", async () => {
    const { GET } = await import("../mintpay/return/route");
    const hash = Buffer.from(
      createHmac("sha256", "secret").update("mp00012440.00ORD-1").digest("hex"),
    ).toString("base64");

    const res = await GET(new Request(`https://shop.example.com/api/payments/mintpay/return?orderId=ORD-1&amount=2440.00&hash=${encodeURIComponent(hash)}&result=success`));

    expect(res.status).toBe(302);
    expect(finalizePaidPayment).toHaveBeenCalledWith("ORD-1", "MINTPAY");
  });

  it("finalizes Mintpay failure when fail HMAC is valid", async () => {
    const { GET } = await import("../mintpay/return/route");
    const hash = Buffer.from(createHmac("sha256", "secret").update("ORD-1").digest("hex")).toString("base64");

    const res = await GET(new Request(`https://shop.example.com/api/payments/mintpay/return?orderId=ORD-1&hash=${encodeURIComponent(hash)}&result=failed`));

    expect(res.status).toBe(302);
    expect(finalizeFailedPayment).toHaveBeenCalledWith("ORD-1", "MINTPAY", "failed");
  });

  it("does not finalize Mintpay when HMAC is invalid", async () => {
    const { GET } = await import("../mintpay/return/route");

    const res = await GET(new Request("https://shop.example.com/api/payments/mintpay/return?orderId=ORD-1&hash=bad&result=success"));

    expect(res.status).toBe(403);
    expect(finalizePaidPayment).not.toHaveBeenCalled();
    expect(finalizeFailedPayment).not.toHaveBeenCalled();
  });

  it("rejects Mintpay return without an order id", async () => {
    const { GET } = await import("../mintpay/return/route");
    const res = await GET(new Request("https://shop.example.com/api/payments/mintpay/return?hash=x&result=success"));
    expect(res.status).toBe(400);
  });

  // ---------- Koko return (browser GET) ----------
  it("finalizes Koko paid on SUCCESS status and redirects", async () => {
    fetchKokoOrderStatus.mockResolvedValue("SUCCESS");
    const { GET } = await import("../koko/return/route");
    const res = await GET(new Request("https://shop.example.com/api/payments/koko/return?order_id=ORD-1"));
    expect(res.status).toBe(302);
    expect(finalizePaidPayment).toHaveBeenCalledWith("ORD-1", "KOKO");
  });

  it("finalizes Koko failed on FAILED status and redirects", async () => {
    fetchKokoOrderStatus.mockResolvedValue("FAILED");
    const { GET } = await import("../koko/return/route");
    const res = await GET(new Request("https://shop.example.com/api/payments/koko/return?order_id=ORD-1"));
    expect(res.status).toBe(302);
    expect(finalizeFailedPayment).toHaveBeenCalledWith("ORD-1", "KOKO", "failed");
  });

  it("redirects Koko PENDING without finalizing", async () => {
    fetchKokoOrderStatus.mockResolvedValue("PENDING");
    const { GET } = await import("../koko/return/route");
    const res = await GET(new Request("https://shop.example.com/api/payments/koko/return?order_id=ORD-1"));
    expect(res.status).toBe(302);
    expect(finalizePaidPayment).not.toHaveBeenCalled();
    expect(finalizeFailedPayment).not.toHaveBeenCalled();
  });

  it("Koko return shows cancelled state on a cancel redirect while status is pending", async () => {
    fetchKokoOrderStatus.mockResolvedValue("PENDING");
    const { GET } = await import("../koko/return/route");
    const res = await GET(new Request("https://shop.example.com/api/payments/koko/return?order_id=ORD-1&status=cancelled"));
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("status=cancelled");
    expect(location).toContain("order_id=ORD-1");
    expect(finalizePaidPayment).not.toHaveBeenCalled();
    expect(finalizeFailedPayment).not.toHaveBeenCalled();
  });

  it("rejects Koko return without an order id", async () => {
    const { GET } = await import("../koko/return/route");
    const res = await GET(new Request("https://shop.example.com/api/payments/koko/return"));
    expect(res.status).toBe(400);
  });

  // ---------- Koko response (server-to-server POST) ----------
  it("finalizes Koko paid via response POST on SUCCESS", async () => {
    fetchKokoOrderStatus.mockResolvedValue("SUCCESS");
    const { POST } = await import("../koko/response/route");
    const res = await POST(new Request("https://shop.example.com/api/payments/koko/response", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ order_id: "ORD-1" }).toString(),
    }));
    expect(res.status).toBe(200);
    expect(finalizePaidPayment).toHaveBeenCalledWith("ORD-1", "KOKO");
  });

  it("finalizes Koko failed via response POST on FAILED", async () => {
    fetchKokoOrderStatus.mockResolvedValue("FAILED");
    const { POST } = await import("../koko/response/route");
    const res = await POST(new Request("https://shop.example.com/api/payments/koko/response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: "ORD-1" }),
    }));
    expect(res.status).toBe(200);
    expect(finalizeFailedPayment).toHaveBeenCalledWith("ORD-1", "KOKO", "failed");
  });

  it("Koko return degrades to a redirect when status lookup fails", async () => {
    fetchKokoOrderStatus.mockRejectedValue(new Error("down"));
    const { GET } = await import("../koko/return/route");
    const res = await GET(new Request("https://shop.example.com/api/payments/koko/return?order_id=ORD-1"));
    expect(res.status).toBe(302);
    expect(finalizePaidPayment).not.toHaveBeenCalled();
    expect(finalizeFailedPayment).not.toHaveBeenCalled();
  });

  it("Koko response returns pending when status lookup fails", async () => {
    fetchKokoOrderStatus.mockRejectedValue(new Error("down"));
    const { POST } = await import("../koko/response/route");
    const res = await POST(new Request("https://shop.example.com/api/payments/koko/response", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ order_id: "ORD-1" }).toString(),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "pending" });
    expect(finalizePaidPayment).not.toHaveBeenCalled();
    expect(finalizeFailedPayment).not.toHaveBeenCalled();
  });
});
