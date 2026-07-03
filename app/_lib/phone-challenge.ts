import { randomInt, createHash } from "crypto";
import { prisma } from "@/app/_lib/prisma";
import { sendOtpSms } from "@/app/_lib/sms";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const HOURLY_CAP = 5;

export class ChallengeCooldownError extends Error {}
export class ChallengeRateLimitError extends Error {}

type Purpose = "SIGNUP" | "RESET";

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Issues a new phone OTP challenge and sends it via SMS.
 * Enforces a resend cooldown and an hourly send cap per phone number.
 * Deletes the created row (does not leave a dangling challenge) if the SMS
 * send fails, then rethrows so callers can surface the error.
 */
export async function issueChallenge(params: {
  phone: string;
  purpose: Purpose;
  payload?: string;
}): Promise<void> {
  const { phone, purpose, payload } = params;
  const now = Date.now();

  const recent = await prisma.phoneChallenge.findFirst({
    where: { phone, purpose, createdAt: { gt: new Date(now - RESEND_COOLDOWN_MS) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent) throw new ChallengeCooldownError();

  const lastHour = await prisma.phoneChallenge.count({
    where: { phone, createdAt: { gt: new Date(now - 60 * 60 * 1000) } },
  });
  if (lastHour >= HOURLY_CAP) throw new ChallengeRateLimitError();

  const code = generateCode();
  const row = await prisma.phoneChallenge.create({
    data: {
      phone,
      purpose,
      codeHash: hashCode(code),
      payload: payload ?? null,
      expiresAt: new Date(now + CODE_TTL_MS),
    },
  });
  try {
    await sendOtpSms(phone, code, purpose);
  } catch (e) {
    // Don't leave a dangling, unusable challenge if the SMS never went out.
    await prisma.phoneChallenge.delete({ where: { id: row.id } }).catch(() => {});
    throw e;
  }
}

/**
 * Verifies a phone OTP challenge. On a correct code, marks the challenge
 * consumed and returns its stored payload. On a wrong code, increments the
 * attempt counter. Fails closed (no active challenge, or attempts exhausted).
 */
export async function verifyChallenge(params: {
  phone: string;
  purpose: Purpose;
  code: string;
}): Promise<{ ok: true; payload: string | null } | { ok: false }> {
  const { phone, purpose, code } = params;
  const row = await prisma.phoneChallenge.findFirst({
    where: { phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row || row.attempts >= MAX_ATTEMPTS) return { ok: false };
  if (row.codeHash !== hashCode(code)) {
    await prisma.phoneChallenge.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return { ok: false };
  }
  await prisma.phoneChallenge.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return { ok: true, payload: row.payload };
}
