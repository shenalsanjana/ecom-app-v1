import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";

const { userFindUnique, userCreate, userUpdate } = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: userFindUnique,
      create: userCreate,
      update: userUpdate,
    },
  },
}));

import { createAdminUser } from "../admin-seed";

const BASE_INPUT = {
  email: "founder@dressingbear.com",
  password: "StrongPass1",
  name: "Founder",
  promote: false,
};

beforeEach(() => {
  userFindUnique.mockReset();
  userCreate.mockReset();
  userUpdate.mockReset();
});

describe("createAdminUser", () => {
  it("creates a new admin when the email doesn't exist", async () => {
    userFindUnique.mockResolvedValue(null);
    userCreate.mockResolvedValue({ id: "u1" });

    const result = await createAdminUser(BASE_INPUT);

    expect(result).toEqual({ ok: true, action: "created", userId: "u1" });
    expect(userCreate).toHaveBeenCalledOnce();
    const arg = userCreate.mock.calls[0][0];
    expect(arg.data.email).toBe(BASE_INPUT.email);
    expect(arg.data.name).toBe(BASE_INPUT.name);
    expect(arg.data.role).toBe("ADMIN");
    // password should be hashed, never stored plain
    expect(arg.data.passwordHash).not.toBe(BASE_INPUT.password);
    expect(await bcrypt.compare(BASE_INPUT.password, arg.data.passwordHash)).toBe(true);
  });

  it("refuses when the user already exists as admin", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", role: "ADMIN" });

    const result = await createAdminUser(BASE_INPUT);

    expect(result).toEqual({
      ok: false,
      reason: "already_admin",
      message: expect.stringContaining("already exists as admin"),
    });
    expect(userCreate).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("refuses to promote a customer without --promote flag", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", role: "CUSTOMER" });

    const result = await createAdminUser({ ...BASE_INPUT, promote: false });

    expect(result).toEqual({
      ok: false,
      reason: "needs_promote_flag",
      message: expect.stringContaining("--promote"),
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("promotes a customer when --promote is set, without changing password", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", role: "CUSTOMER" });
    userUpdate.mockResolvedValue({ id: "u1" });

    const result = await createAdminUser({ ...BASE_INPUT, promote: true });

    expect(result).toEqual({ ok: true, action: "promoted", userId: "u1" });
    expect(userUpdate).toHaveBeenCalledOnce();
    const arg = userUpdate.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "u1" });
    expect(arg.data).toEqual({ role: "ADMIN" });
    // passwordHash must NOT appear in the update payload
    expect(Object.keys(arg.data)).not.toContain("passwordHash");
  });

  it("refuses a user with an unknown role even with --promote", async () => {
    userFindUnique.mockResolvedValue({ id: "u1", role: "STAFF" });

    const result = await createAdminUser({ ...BASE_INPUT, promote: true });

    expect(result).toEqual({
      ok: false,
      reason: "unexpected_role",
      message: expect.stringContaining("unexpected role"),
    });
    expect(userUpdate).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("rejects invalid input (bad email)", async () => {
    const result = await createAdminUser({ ...BASE_INPUT, email: "not-an-email" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_input");
    }
  });

  it("rejects invalid input (weak password)", async () => {
    const result = await createAdminUser({ ...BASE_INPUT, password: "short" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_input");
    }
  });

  it("rejects invalid input (empty name)", async () => {
    const result = await createAdminUser({ ...BASE_INPUT, name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_input");
    }
  });
});
