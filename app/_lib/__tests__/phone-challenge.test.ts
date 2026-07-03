import { describe, it, expect, beforeEach, vi } from "vitest";

const { create, findFirst, update, count, del } = vi.hoisted(() => ({
  create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn(), del: vi.fn(),
}));
const { sendOtpSms } = vi.hoisted(() => ({ sendOtpSms: vi.fn() }));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { phoneChallenge: { create, findFirst, update, count, delete: del } },
}));
vi.mock("@/app/_lib/sms", () => ({ sendOtpSms }));

import {
  issueChallenge, verifyChallenge, ChallengeCooldownError, ChallengeRateLimitError,
} from "../phone-challenge";
import { createHash } from "crypto";

beforeEach(() => {
  create.mockReset().mockResolvedValue({ id: "c1" });
  findFirst.mockReset().mockResolvedValue(null); // no recent challenge (no cooldown)
  update.mockReset().mockResolvedValue({});
  count.mockReset().mockResolvedValue(0);         // under hourly cap
  del.mockReset().mockResolvedValue({});
  sendOtpSms.mockReset().mockResolvedValue(undefined);
});

describe("issueChallenge", () => {
  it("stores a sha256 code hash and sends the SMS", async () => {
    await issueChallenge({ phone: "+94771234567", purpose: "SIGNUP", payload: "{}" });
    const data = create.mock.calls[0][0].data;
    expect(data.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sendOtpSms).toHaveBeenCalledOnce();
    const sentCode = sendOtpSms.mock.calls[0][1];
    expect(createHash("sha256").update(sentCode).digest("hex")).toBe(data.codeHash);
  });

  it("throws cooldown when a recent challenge exists", async () => {
    findFirst.mockResolvedValueOnce({ id: "recent" }); // cooldown lookup hits
    await expect(issueChallenge({ phone: "+94771234567", purpose: "SIGNUP" }))
      .rejects.toBeInstanceOf(ChallengeCooldownError);
    expect(sendOtpSms).not.toHaveBeenCalled();
  });

  it("throws rate limit when the hourly cap is reached", async () => {
    count.mockResolvedValueOnce(5); // at cap; findFirst stays null so cooldown passes
    await expect(issueChallenge({ phone: "+94771234567", purpose: "SIGNUP" }))
      .rejects.toBeInstanceOf(ChallengeRateLimitError);
    expect(sendOtpSms).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("deletes the dangling row and rethrows if the SMS send fails", async () => {
    create.mockResolvedValueOnce({ id: "c1" });
    sendOtpSms.mockRejectedValueOnce(new Error("notify down"));
    await expect(issueChallenge({ phone: "+94771234567", purpose: "SIGNUP" })).rejects.toThrow("notify down");
    expect(del).toHaveBeenCalledWith({ where: { id: "c1" } });
  });
});

describe("verifyChallenge", () => {
  const code = "123456";
  const codeHash = createHash("sha256").update(code).digest("hex");

  it("consumes and returns the payload on a correct code", async () => {
    findFirst.mockResolvedValueOnce({ id: "c1", codeHash, attempts: 0, payload: "{\"x\":1}" });
    const r = await verifyChallenge({ phone: "+94771234567", purpose: "SIGNUP", code });
    expect(r).toEqual({ ok: true, payload: "{\"x\":1}" });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { consumedAt: expect.any(Date) } }));
    // Guard the security-critical WHERE filters: an expired or already-consumed
    // challenge must never be eligible for a match (rejects replay + expiry bypass).
    expect(findFirst.mock.calls[0][0].where).toMatchObject({
      consumedAt: null,
      expiresAt: { gt: expect.any(Date) },
    });
  });

  it("increments attempts and fails on a wrong code", async () => {
    findFirst.mockResolvedValueOnce({ id: "c1", codeHash, attempts: 0, payload: null });
    const r = await verifyChallenge({ phone: "+94771234567", purpose: "SIGNUP", code: "000000" });
    expect(r).toEqual({ ok: false });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { attempts: { increment: 1 } } }));
  });

  it("fails when no active challenge exists", async () => {
    findFirst.mockResolvedValueOnce(null);
    expect(await verifyChallenge({ phone: "+94771234567", purpose: "SIGNUP", code })).toEqual({ ok: false });
  });

  it("fails when attempts are exhausted", async () => {
    findFirst.mockResolvedValueOnce({ id: "c1", codeHash, attempts: 5, payload: null });
    expect(await verifyChallenge({ phone: "+94771234567", purpose: "SIGNUP", code })).toEqual({ ok: false });
    expect(update).not.toHaveBeenCalled();
  });
});
