import { describe, it, expect, beforeEach, vi } from "vitest";

const { redirectMock, authMock, userFindUnique } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    // next/navigation's redirect() throws internally; we mirror that.
    throw new Error(`REDIRECT:${url}`);
  }),
  authMock: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/app/_lib/auth", () => ({ auth: authMock }));

vi.mock("@/app/_lib/prisma", () => ({ prisma: { user: { findUnique: userFindUnique } } }));

import { requireAdmin, requireAdminApi } from "../admin-auth";

beforeEach(() => {
  redirectMock.mockClear();
  authMock.mockReset();
  userFindUnique.mockReset().mockResolvedValue({ role: "ADMIN" });
});

describe("requireAdmin", () => {

  it("redirects to /login when no session", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login?callbackUrl=/admin");
  });

  it("redirects to / when authenticated but not admin", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "CUSTOMER" } });
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/");
  });

  it("returns the session when role === ADMIN", async () => {
    const session = { user: { id: "u1", role: "ADMIN" } };
    authMock.mockResolvedValue(session);
    await expect(requireAdmin()).resolves.toEqual(session);
  });
});

describe("requireAdminApi", () => {
  it("returns 401 Response when no session", async () => {
    authMock.mockResolvedValue(null);
    const result = await requireAdminApi();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  it("returns 403 Response when authenticated but not admin", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "CUSTOMER" } });
    const result = await requireAdminApi();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("returns { session } when role === ADMIN", async () => {
    const session = { user: { id: "u1", role: "ADMIN" } };
    authMock.mockResolvedValue(session);
    const result = await requireAdminApi();
    expect(result).toEqual({ session });
  });
});


describe("current database authorization", () => {
  it("rejects an old admin token after demotion", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
    userFindUnique.mockResolvedValue({ role: "CUSTOMER" });
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/");
    expect((await requireAdminApi() as Response).status).toBe(403);
  });
  it("rejects a deleted administrator", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
    userFindUnique.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow("REDIRECT:/login");
    expect((await requireAdminApi() as Response).status).toBe(401);
  });
});
