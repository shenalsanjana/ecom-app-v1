import { describe, it, expect, beforeEach, vi } from "vitest";

const { findUnique, update, updateMany, $transaction } = vi.hoisted(() => ({
  findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
const { issueChallenge, verifyChallenge } = vi.hoisted(() => ({ issueChallenge: vi.fn(), verifyChallenge: vi.fn() }));
const { issuePasswordReset } = vi.hoisted(() => ({ issuePasswordReset: vi.fn() }));
const { redirect } = vi.hoisted(() => ({ redirect: vi.fn(() => { throw new Error("REDIRECT"); }) }));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { user: { findUnique, update }, passwordResetToken: { updateMany }, $transaction },
}));
vi.mock("@/app/_lib/phone-challenge", () => ({ issueChallenge, verifyChallenge, ChallengeCooldownError: class extends Error {} }));
vi.mock("@/app/_lib/password-reset", () => ({ issuePasswordReset }));
vi.mock("next/navigation", () => ({ redirect }));
// actions.ts still imports `signIn`/`AuthError` for the untouched loginAction;
// without these mocks, next-auth's module graph fails to resolve under vitest
// (same fix used by signup-phone.test.ts).
vi.mock("@/app/_lib/auth", () => ({ signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() }));
vi.mock("next-auth", () => ({ AuthError: class extends Error {} }));

import { requestResetAction, resetByPhoneAction } from "../actions";

function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; }
beforeEach(() => {
  [findUnique, update, updateMany, issueChallenge, verifyChallenge, issuePasswordReset, redirect].forEach((m) => m.mockReset());
  $transaction.mockReset();
  $transaction.mockImplementation(async (ops: unknown[]) => ops);
  redirect.mockImplementation(() => { throw new Error("REDIRECT"); });
});

describe("requestResetAction", () => {
  it("sends an SMS code when the identifier is a phone with an account", async () => {
    findUnique.mockResolvedValue({ id: "u1" });
    const s = await requestResetAction(null, fd({ identifier: "0771234567" }));
    expect(issueChallenge).toHaveBeenCalledWith(expect.objectContaining({ phone: "+94771234567", purpose: "RESET" }));
    expect(s).toMatchObject({ mode: "phone-code", phone: "+94771234567" });
  });
  it("uses the email link path for an email identifier", async () => {
    findUnique.mockResolvedValue({ id: "u1", email: "a@b.test" });
    const s = await requestResetAction(null, fd({ identifier: "a@b.test" }));
    expect(issuePasswordReset).toHaveBeenCalled();
    expect(s).toMatchObject({ mode: "email-sent" });
  });
  it("is neutral for an unknown phone (no SMS, same UI)", async () => {
    findUnique.mockResolvedValue(null);
    const s = await requestResetAction(null, fd({ identifier: "0770000000" }));
    expect(issueChallenge).not.toHaveBeenCalled();
    expect(s).toMatchObject({ mode: "phone-code" });
  });
});

describe("resetByPhoneAction", () => {
  it("sets the new password and redirects on a valid code", async () => {
    verifyChallenge.mockResolvedValue({ ok: true, payload: null });
    findUnique.mockResolvedValue({ id: "u1" });
    update.mockResolvedValue({});
    await expect(resetByPhoneAction(null, fd({ phone: "+94771234567", code: "123456", newPassword: "abcd1234", confirmPassword: "abcd1234" }))).rejects.toThrow("REDIRECT");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "u1" } }));
    expect(redirect).toHaveBeenCalledWith("/login?reset=success");
  });
  it("rejects a bad code", async () => {
    verifyChallenge.mockResolvedValue({ ok: false });
    const s = await resetByPhoneAction(null, fd({ phone: "+94771234567", code: "000000", newPassword: "abcd1234", confirmPassword: "abcd1234" }));
    expect(s).toMatchObject({ mode: "phone-code", error: expect.stringMatching(/invalid or has expired/i) });
    expect(update).not.toHaveBeenCalled();
  });
});
