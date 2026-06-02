// app/(auth)/actions.ts
"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { AuthError } from "next-auth";
import { signIn } from "@/app/_lib/auth";
import { prisma } from "@/app/_lib/prisma";
import { issuePasswordReset } from "@/app/_lib/password-reset";
import {
  SignupSchema,
  LoginSchema,
  RequestResetSchema,
  ResetPasswordSchema,
} from "@/app/_lib/validation";
import { chooseLoginRedirect } from "./login-redirect";

export type ActionState =
  | { error?: string; success?: string; redirectTo?: string }
  | null;

function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return "/";
  // Same-origin only — reject "//evil.com/foo" and absolute URLs.
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

function flatten(errs: unknown): string {
  if (typeof errs === "object" && errs && "issues" in errs) {
    const issues = (errs as { issues: { message: string }[] }).issues;
    return issues.map((i) => i.message).join("; ");
  }
  return "Invalid input";
}

const NEUTRAL_SIGNUP_MESSAGE =
  "If this email isn't already registered, your account is ready. Sign in to continue.";

export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  console.log("[Signup Action]: Starting...");
  const parsed = SignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    console.warn("[Signup Action]: Validation failed", parsed.error.format());
    return { error: flatten(parsed.error) };
  }

  console.log(`[Signup Action]: Checking for existing user: ${parsed.data.email}`);
  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    console.log("[Signup Action]: User already exists, returning neutral message.");
    return { success: NEUTRAL_SIGNUP_MESSAGE };
  }

  console.log(`[Signup Action]: Creating new user: ${parsed.data.email}`);
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: { name: parsed.data.name, email: parsed.data.email, passwordHash },
  });

  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl") as string | null);
  console.log(`[Signup Action]: User created, calling signIn with callbackUrl: ${callbackUrl}`);

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
    console.log("[Signup Action]: signIn cookie set, returning redirectTo for client navigation");
    return { redirectTo: callbackUrl };
  } catch (error) {
    if (error instanceof AuthError) {
      console.warn("[Signup Action]: AuthError during auto sign-in", error.type);
      return { success: NEUTRAL_SIGNUP_MESSAGE };
    }
    console.error("[Signup Action]: Unexpected error during signIn", error);
    return { success: NEUTRAL_SIGNUP_MESSAGE };
  }
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  console.log("[Login Action]: Starting...");
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    console.warn("[Login Action]: Validation failed");
    return { error: "Invalid email or password" };
  }

  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl") as string | null);
  console.log(`[Login Action]: Attempting signIn for ${parsed.data.email} with callbackUrl: ${callbackUrl}`);

  // Read role from the DB BEFORE signIn — auth() in the same request does not
  // reliably see the just-set session cookie under NextAuth v5 + JWT sessions.
  // This is one extra indexed lookup; the alternative (relying on auth() to
  // see the new cookie) silently sends admins to the wrong page on miss.
  const dbUser = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { role: true },
  });
  const role = dbUser?.role === "ADMIN" ? "ADMIN" : "CUSTOMER";

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });

    const redirectTo = chooseLoginRedirect(role, callbackUrl);
    console.log(`[Login Action]: signIn cookie set, role=${role}, redirectTo=${redirectTo}`);
    return { redirectTo };
  } catch (error) {
    if (error instanceof AuthError) {
      console.warn("[Login Action]: AuthError during signIn", error.type);
      return { error: "Invalid email or password" };
    }
    console.error("[Login Action]: Unexpected error during signIn", error);
    throw error;
  }
}

export async function requestResetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = RequestResetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { success: "If an account with that email exists, you'll receive a reset link shortly." };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user) {
    try {
      await issuePasswordReset(user);
    } catch (e) {
      console.error("[forgot-password] issuePasswordReset failed:", e);
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
