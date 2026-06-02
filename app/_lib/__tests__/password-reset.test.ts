import { describe, it, expect, beforeEach, vi } from "vitest";

const { tokenCreate } = vi.hoisted(() => ({ tokenCreate: vi.fn() }));
const { sendPasswordResetEmail } = vi.hoisted(() => ({ sendPasswordResetEmail: vi.fn() }));

vi.mock("@/app/_lib/prisma", () => ({ prisma: { passwordResetToken: { create: tokenCreate } } }));
vi.mock("@/app/_lib/mailer", () => ({ sendPasswordResetEmail }));

import { issuePasswordReset } from "../password-reset";
import { createHash } from "crypto";

beforeEach(() => {
  tokenCreate.mockReset().mockResolvedValue({});
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
});
