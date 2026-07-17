import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    $queryRaw: queryRaw,
  },
}));

import { GET } from "../route";

describe("GET /api/health", () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  it("returns 200 ok when the database responds", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("returns 500 when the database query fails", async () => {
    queryRaw.mockRejectedValue(new Error("connection refused"));

    const res = await GET();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ status: "error" });
  });

  it("does not leak error details in the response body", async () => {
    queryRaw.mockRejectedValue(new Error("password authentication failed for user \"app\""));

    const res = await GET();
    const body = await res.json();

    expect(JSON.stringify(body)).not.toContain("password");
  });
});
