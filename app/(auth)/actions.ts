// app/(auth)/actions.ts
"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "crypto";
import { signIn, signOut } from "@/app/_lib/auth";
import { prisma } from "@/app/_lib/prisma";
import { sendPasswordResetEmail } from "@/app/_lib/mailer";
import {
  SignupSchema,
  LoginSchema,
  RequestResetSchema,
  ResetPasswordSchema,
} from "@/app/_lib/validation";

export type ActionState = { error?: string; success?: string } | null;

function flatten(errs: unknown): string {
  if (typeof errs === "object" && errs && "issues" in errs) {
    const issues = (errs as { issues: { message: string }[] }).issues;
    return issues.map((i) => i.message).join("; ");
  }
  return "Invalid input";
}

export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = SignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: flatten(parsed.error) };

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: "Email already in use" };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: { name: parsed.data.name, email: parsed.data.email, passwordHash },
  });

  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirect: false,
  });

  redirect("/");
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Invalid email or password" };

  const callbackUrl = (formData.get("callbackUrl") as string) || "/";

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch {
    return { error: "Invalid email or password" };
  }
  redirect(callbackUrl);
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

export async function requestResetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = RequestResetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { success: "If an account with that email exists, you'll receive a reset link shortly." };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user) {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const resetUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${rawToken}`;
    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (e) {
      console.error("[forgot-password] mail send failed:", e);
    }
  }

  return { success: "If an account with that email exists, you'll receive a reset link shortly." };
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ResetPasswordSchema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: flatten(parsed.error) };

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const tokenRow = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!tokenRow || tokenRow.usedAt || tokenRow.expiresAt < new Date()) {
    return { error: "This reset link is invalid or has expired." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);

  await prisma.$transaction([
    prisma.user.update({ where: { id: tokenRow.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: tokenRow.id }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.updateMany({
      where: { userId: tokenRow.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  redirect("/login?reset=success");
}
