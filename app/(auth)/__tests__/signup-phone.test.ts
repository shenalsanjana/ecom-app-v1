import { describe, it, expect, beforeEach, vi } from "vitest";

const { findFirst, findUnique, create } = vi.hoisted(() => ({
  findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(),
}));
const { issueChallenge, verifyChallenge, issueAccountExistsNotice } = vi.hoisted(() => ({
  issueChallenge: vi.fn(), verifyChallenge: vi.fn(), issueAccountExistsNotice: vi.fn(),
}));
const { redirect } = vi.hoisted(() => ({ redirect: vi.fn(() => { throw new Error("REDIRECT"); }) }));

vi.mock("@/app/_lib/prisma", () => ({ prisma: { user: { findFirst, findUnique, create } } }));
vi.mock("@/app/_lib/phone-challenge", () => ({
  issueChallenge,
  verifyChallenge,
  issueAccountExistsNotice,
  ChallengeCooldownError: class extends Error {},
  ChallengeRateLimitError: class extends Error {},
}));
vi.mock("next/navigation", () => ({ redirect }));
// actions.ts still imports `signIn`/`AuthError` for the untouched loginAction;
// without these mocks, next-auth's module graph fails to resolve "next/server"
// under vitest (same fix used by checkout/products actions tests, extended to
// the direct `next-auth` package import that only this action file has).
vi.mock("@/app/_lib/auth", () => ({ signIn: vi.fn() }));
vi.mock("next-auth", () => ({ AuthError: class extends Error {} }));

import { signupAction } from "../actions";
import { ChallengeRateLimitError } from "@/app/_lib/phone-challenge";

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

beforeEach(() => {
  [findFirst, findUnique, create, issueChallenge, verifyChallenge, issueAccountExistsNotice, redirect]
    .forEach((m) => m.mockReset());
  redirect.mockImplementation(() => { throw new Error("REDIRECT"); });
  issueAccountExistsNotice.mockResolvedValue(undefined);
});

describe("signupAction — request step", () => {
  const details = { step: "request", name: "Amal", phone: "0771234567", email: "", password: "abcd1234", confirmPassword: "abcd1234" };

  it("issues a challenge and advances to verify for a fresh number", async () => {
    findFirst.mockResolvedValue(null); // no verified account
    const s = await signupAction(null, fd(details));
    expect(issueChallenge).toHaveBeenCalledWith(expect.objectContaining({ phone: "+94771234567", purpose: "SIGNUP" }));
    expect(s).toMatchObject({ step: "verify", phone: "+94771234567" });
  });

  it("is enumeration-safe: already-verified number → same verify step, no signup challenge, throttled account-exists notice", async () => {
    findFirst.mockResolvedValue({ id: "u1" }); // already verified
    const s = await signupAction(null, fd(details));
    expect(issueChallenge).not.toHaveBeenCalled();
    expect(issueAccountExistsNotice).toHaveBeenCalledWith("+94771234567");
    expect(s).toMatchObject({ step: "verify", phone: "+94771234567" });
  });

  it("closes the enumeration oracle: fresh number hitting the hourly cap still returns step:verify, not step:details", async () => {
    findFirst.mockResolvedValue(null); // no verified account — fresh-number branch
    issueChallenge.mockRejectedValue(new ChallengeRateLimitError());
    const s = await signupAction(null, fd(details));
    expect(s).toMatchObject({ step: "verify", phone: "+94771234567" });
    expect(s).not.toMatchObject({ step: "details" });
  });
});

describe("signupAction — verify step", () => {
  it("creates the verified user then redirects to /login?created=1", async () => {
    verifyChallenge.mockResolvedValue({ ok: true, payload: JSON.stringify({ name: "Amal", email: null, passwordHash: "h" }) });
    create.mockResolvedValue({ id: "u1" });
    await expect(signupAction(null, fd({ step: "verify", phone: "+94771234567", code: "123456" }))).rejects.toThrow("REDIRECT");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ phone: "+94771234567", name: "Amal", passwordHash: "h", phoneVerifiedAt: expect.any(Date) }),
    }));
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining("/login?created=1"));
  });

  it("returns a friendly error on a bad code", async () => {
    verifyChallenge.mockResolvedValue({ ok: false });
    const s = await signupAction(null, fd({ step: "verify", phone: "+94771234567", code: "000000" }));
    expect(s).toMatchObject({ step: "verify", error: expect.stringMatching(/invalid or has expired/i) });
    expect(create).not.toHaveBeenCalled();
  });
});
