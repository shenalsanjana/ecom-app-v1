import { describe, it, expect, beforeEach, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
const { userFindUnique, userUpdate, userCount } = vi.hoisted(() => ({
  userFindUnique: vi.fn(), userUpdate: vi.fn(), userCount: vi.fn(),
}));
const { issuePasswordReset } = vi.hoisted(() => ({ issuePasswordReset: vi.fn() }));

vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: { user: { findUnique: userFindUnique, update: userUpdate, count: userCount } },
}));
vi.mock("@/app/_lib/password-reset", () => ({ issuePasswordReset }));

import { changeRole, sendPasswordReset } from "../actions";

beforeEach(() => {
  requireAdmin.mockReset().mockResolvedValue({ user: { id: "admin1", email: "admin@x.test" } });
  userFindUnique.mockReset();
  userUpdate.mockReset();
  userCount.mockReset();
  issuePasswordReset.mockReset();
});

describe("changeRole", () => {
  it("rejects an invalid role", async () => {
    const res = await changeRole("u2", "WIZARD" as never);
    expect(res).toEqual({ success: false, error: "Invalid role" });
  });
  it("rejects changing your own role", async () => {
    const res = await changeRole("admin1", "CUSTOMER");
    expect(res).toEqual({ success: false, error: "You can't change your own role" });
    expect(userUpdate).not.toHaveBeenCalled();
  });
  it("rejects when the user is not found", async () => {
    userFindUnique.mockResolvedValueOnce(null);
    const res = await changeRole("ghost", "ADMIN");
    expect(res).toEqual({ success: false, error: "User not found" });
  });
  it("rejects demoting the last admin", async () => {
    userFindUnique.mockResolvedValueOnce({ id: "u2", role: "ADMIN" });
    userCount.mockResolvedValueOnce(1); // only one admin
    const res = await changeRole("u2", "CUSTOMER");
    expect(res).toEqual({ success: false, error: "Can't demote the last admin" });
    expect(userUpdate).not.toHaveBeenCalled();
  });
  it("promotes a customer to admin", async () => {
    userFindUnique.mockResolvedValueOnce({ id: "u2", role: "CUSTOMER" });
    userUpdate.mockResolvedValueOnce({});
    const res = await changeRole("u2", "ADMIN");
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u2" }, data: { role: "ADMIN" } });
    expect(res).toEqual({ success: true });
  });
});

describe("sendPasswordReset", () => {
  it("rejects when the user is not found", async () => {
    userFindUnique.mockResolvedValueOnce(null);
    const res = await sendPasswordReset("ghost");
    expect(res).toEqual({ success: false, error: "User not found" });
    expect(issuePasswordReset).not.toHaveBeenCalled();
  });
  it("issues a reset for an existing user", async () => {
    userFindUnique.mockResolvedValueOnce({ id: "u2", email: "u2@x.test" });
    issuePasswordReset.mockResolvedValueOnce(undefined);
    const res = await sendPasswordReset("u2");
    expect(issuePasswordReset).toHaveBeenCalledWith({ id: "u2", email: "u2@x.test" });
    expect(res).toEqual({ success: true });
  });
  it("returns an error when the email send throws", async () => {
    userFindUnique.mockResolvedValueOnce({ id: "u2", email: "u2@x.test" });
    issuePasswordReset.mockRejectedValueOnce(new Error("smtp down"));
    const res = await sendPasswordReset("u2");
    expect(res).toEqual({ success: false, error: "Couldn't send the reset email." });
  });
});
