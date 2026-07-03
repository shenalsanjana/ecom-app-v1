// app/(auth)/actions.ts
"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { AuthError } from "next-auth";
import { signIn } from "@/app/_lib/auth";
import { prisma } from "@/app/_lib/prisma";
import { issuePasswordReset } from "@/app/_lib/password-reset";
import { issueChallenge, verifyChallenge, ChallengeCooldownError } from "@/app/_lib/phone-challenge";
import { sendAccountExistsSms } from "@/app/_lib/sms";
import {
  SignupSchema,
  LoginSchema,
  RequestResetSchema,
  ResetPasswordSchema,
  LkMobileSchema,
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

export type SignupState =
  | { step: "details" | "verify"; phone?: string; callbackUrl?: string; error?: string }
  | null;

export async function signupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl") as string | null);
  if (formData.get("step") === "verify") return signupVerify(formData, callbackUrl);
  return signupRequest(formData, callbackUrl);
}

function emptyToUndef(v: FormDataEntryValue | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : undefined;
}

async function signupRequest(formData: FormData, callbackUrl: string): Promise<SignupState> {
  const parsed = SignupSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: emptyToUndef(formData.get("email")),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { step: "details", error: flatten(parsed.error), callbackUrl };

  const phone = parsed.data.phone; // canonical +947...
  const existing = await prisma.user.findFirst({ where: { phone, phoneVerifiedAt: { not: null } } });
  if (existing) {
    // Enumeration-safe: identical web response; the number's owner learns the
    // truth only by SMS. No usable signup challenge is created.
    try { await sendAccountExistsSms(phone); } catch (e) { console.error("[Signup] existence SMS failed", e); }
    return { step: "verify", phone, callbackUrl };
  }

  let email = parsed.data.email ?? null;
  if (email) {
    const taken = await prisma.user.findUnique({ where: { email } });
    if (taken) email = null; // optional-email collision → silently drop; never leak/fail
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const payload = JSON.stringify({ name: parsed.data.name, email, passwordHash });
  try {
    await issueChallenge({ phone, purpose: "SIGNUP", payload });
  } catch (e) {
    if (e instanceof ChallengeCooldownError) return { step: "verify", phone, callbackUrl }; // a code was just sent
    console.error("[Signup] issueChallenge failed", e);
    return { step: "details", error: "We couldn't send a code right now. Please try again shortly.", callbackUrl };
  }
  return { step: "verify", phone, callbackUrl };
}

async function signupVerify(formData: FormData, callbackUrl: string): Promise<SignupState> {
  const phoneParsed = LkMobileSchema.safeParse(formData.get("phone"));
  const code = formData.get("code");
  if (!phoneParsed.success || typeof code !== "string" || !/^\d{6}$/.test(code)) {
    const phone = phoneParsed.success ? phoneParsed.data : undefined;
    return { step: "verify", phone, error: "Enter the 6-digit code we sent you.", callbackUrl };
  }
  const phone = phoneParsed.data;
  const result = await verifyChallenge({ phone, purpose: "SIGNUP", code });
  if (!result.ok || !result.payload) {
    return { step: "verify", phone, error: "That code is invalid or has expired.", callbackUrl };
  }
  const data = JSON.parse(result.payload) as { name: string; email: string | null; passwordHash: string };
  try {
    await prisma.user.create({
      data: { name: data.name, email: data.email, phone, phoneVerifiedAt: new Date(), passwordHash: data.passwordHash },
    });
  } catch {
    // Unique violation (race with a concurrent verify) → already registered.
    return { step: "verify", phone, error: "This number is already registered. Please sign in.", callbackUrl };
  }
  const suffix = callbackUrl && callbackUrl !== "/" ? `&callbackUrl=${encodeURIComponent(callbackUrl)}` : "";
  redirect(`/login?created=1${suffix}`);
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
  if (user && user.email) {
    try {
      await issuePasswordReset({ id: user.id, email: user.email });
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
