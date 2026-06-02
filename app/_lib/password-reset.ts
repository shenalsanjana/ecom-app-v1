import { randomBytes, createHash } from "crypto";
import { prisma } from "@/app/_lib/prisma";
import { sendPasswordResetEmail } from "@/app/_lib/mailer";

/**
 * Issues a password-reset token for the user and emails the reset link.
 * Shared by the public forgot-password flow and the admin Customers action.
 * May throw if the email send fails (callers decide how to handle).
 */
export async function issuePasswordReset(user: { id: string; email: string }): Promise<void> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  const tokenRow = await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const resetUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${rawToken}`;
  try {
    await sendPasswordResetEmail(user.email, resetUrl);
  } catch (e) {
    // Don't leave a dangling, unusable token if the email never went out.
    await prisma.passwordResetToken.delete({ where: { id: tokenRow.id } }).catch(() => {});
    throw e;
  }
}
