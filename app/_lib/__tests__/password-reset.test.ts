import { describe, it, expect, beforeEach, vi } from "vitest";

const { tokenCreate, tokenDelete } = vi.hoisted(() => ({ tokenCreate: vi.fn(), tokenDelete: vi.fn() }));
const { sendPasswordResetEmail } = vi.hoisted(() => ({ sendPasswordResetEmail: vi.fn() }));

vi.mock("@/app/_lib/prisma", () => ({ prisma: { passwordResetToken: { create: tokenCreate, delete: tokenDelete } } }));
vi.mock("@/app/_lib/mailer", () => ({ sendPasswordResetEmail }));

import { issuePasswordReset } from "../password-reset";
import { createHash } from "crypto";

beforeEach(() => {
  tokenCreate.mockReset().mockResolvedValue({ id: "tok1" });
  tokenDelete.mockReset().mockResolvedValue({});
  sendPasswordResetEmail.mockReset().mockResolvedValue(undefined);
  process.env.APP_URL = "https://shop.test";
});

describe("issuePasswordReset", () => {
  it("creates a 30-min sha256 token and emails a reset link", async () => {
    await issuePasswordReset({ id: "u1", email: "a@b.test" });

    const data = tokenCreate.mock.calls[0][0].data;
    expect(data.userId).toBe("u1");
    expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
    const ttlMs = data.expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(29 * 60_000);
    expect(ttlMs).toBeLessThanOrEqual(30 * 60_000);

    const [to, url] = sendPasswordResetEmail.mock.calls[0];
    expect(to).toBe("a@b.test");
    expect(url).toMatch(/^https:\/\/shop\.test\/reset-password\?token=[a-f0-9]{64}$/);
    // the emailed raw token hashes to the stored tokenHash
    const rawToken = url.split("token=")[1];
    expect(createHash("sha256").update(rawToken).digest("hex")).toBe(data.tokenHash);
  });

  it("falls back to localhost when APP_URL is unset", async () => {
    delete process.env.APP_URL;
    await issuePasswordReset({ id: "u1", email: "a@b.test" });
    const url = sendPasswordResetEmail.mock.calls[0][1];
    expect(url).toMatch(/^http:\/\/localhost:3000\/reset-password\?token=[a-f0-9]{64}$/);
  });

  it("deletes the dangling token and rethrows when the email send fails", async () => {
    sendPasswordResetEmail.mockRejectedValueOnce(new Error("smtp down"));
    await expect(issuePasswordReset({ id: "u1", email: "a@b.test" })).rejects.toThrow("smtp down");
    expect(tokenDelete).toHaveBeenCalledWith({ where: { id: "tok1" } });
  });
});
