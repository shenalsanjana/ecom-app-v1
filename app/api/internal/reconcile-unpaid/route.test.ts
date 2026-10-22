import { beforeEach, describe, expect, it, vi } from "vitest";

const reconcile = vi.hoisted(() => vi.fn());
vi.mock("@/app/_lib/payments/reconcile-unpaid", () => ({ reconcileUnpaidOrders: reconcile }));
import { POST } from "./route";

beforeEach(() => { vi.unstubAllEnvs(); reconcile.mockReset().mockResolvedValue([]); });
describe("scheduled reconciliation authentication", () => {
  it("fails closed without configuration", async () => {
    vi.stubEnv("RECONCILIATION_SECRET", "");
    expect((await POST(new Request("https://example.test/api/internal/reconcile-unpaid", { method: "POST" }))).status).toBe(503);
    expect(reconcile).not.toHaveBeenCalled();
  });
  it("rejects an invalid bearer secret", async () => {
    vi.stubEnv("RECONCILIATION_SECRET", "test-job-secret");
    expect((await POST(new Request("https://example.test/api/internal/reconcile-unpaid", { method: "POST", headers: { Authorization: "Bearer wrong" } }))).status).toBe(401);
    expect(reconcile).not.toHaveBeenCalled();
  });
  it("runs only an authenticated request", async () => {
    vi.stubEnv("RECONCILIATION_SECRET", "test-job-secret");
    expect((await POST(new Request("https://example.test/api/internal/reconcile-unpaid", { method: "POST", headers: { Authorization: "Bearer test-job-secret" } }))).status).toBe(200);
    expect(reconcile).toHaveBeenCalledOnce();
  });
});
