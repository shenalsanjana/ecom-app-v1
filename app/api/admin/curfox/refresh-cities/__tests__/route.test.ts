import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const refreshSpy = vi.fn();
vi.mock("@/app/_lib/courier/city-map", () => ({
  refreshCurfoxCityMap: refreshSpy,
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  refreshSpy.mockReset();
  process.env.AUTH_SECRET = "test-secret-value";
});
afterEach(() => {
  process.env = { ...originalEnv };
});

async function callRoute(headers: Record<string, string> = {}): Promise<Response> {
  const { POST } = await import("../route");
  return POST(new Request("http://localhost/api/admin/curfox/refresh-cities", {
    method: "POST",
    headers,
  }));
}

describe("POST /api/admin/curfox/refresh-cities", () => {
  it("rejects requests without Authorization header", async () => {
    const res = await callRoute();
    expect(res.status).toBe(401);
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("rejects requests with wrong bearer", async () => {
    const res = await callRoute({ Authorization: "Bearer wrong" });
    expect(res.status).toBe(401);
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("returns the count from refreshCurfoxCityMap on success", async () => {
    refreshSpy.mockResolvedValueOnce({ count: 42 });
    const res = await callRoute({ Authorization: "Bearer test-secret-value" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ count: 42 });
    expect(refreshSpy).toHaveBeenCalledOnce();
  });

  it("rejects when AUTH_SECRET env is unset", async () => {
    delete process.env.AUTH_SECRET;
    const res = await callRoute({ Authorization: "Bearer test-secret-value" });
    expect(res.status).toBe(401);
  });

  it("returns 500 when refresh throws", async () => {
    refreshSpy.mockRejectedValueOnce(new Error("curfox down"));
    const res = await callRoute({ Authorization: "Bearer test-secret-value" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("curfox down");
  });
});
