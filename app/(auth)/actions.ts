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
  issueChallenge,
  verifyChallenge,
  issueAccountExistsNotice,
  ChallengeCooldownError,
  ChallengeRateLimitError,
} from "@/app/_lib/phone-challenge";
import { resolveIdentifier } from "@/app/_lib/phone";
import {
  SignupSchema,
  LoginSchema,
  RequestResetSchema,
  ResetPasswordSchema,
  ResetByPhoneSchema,
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
    // truth only by SMS. No usable signup challenge is created. The notice is
    // throttled + counted identically to a real OTP send (issueAccountExistsNotice
    // shares issueChallenge's cooldown/hourly-cap budget) so throttling can't be
    // used to distinguish this branch from the fresh-number branch below.
    try {
      await issueAccountExistsNotice(phone);
    } catch (e) {
      if (!(e instanceof ChallengeCooldownError || e instanceof ChallengeRateLimitError)) {
        console.error("[Signup] account-exists notice failed", e);
      }
    }
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
    if (e instanceof ChallengeCooldownError || e instanceof ChallengeRateLimitError) {
      // A code was just sent, or the hourly cap is hit — neutral response so this
      // matches the already-registered branch's throttled state exactly and
      // doesn't leak account existence via a "details" vs "verify" divergence.
      return { step: "verify", phone, callbackUrl };
    }
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
  let data: { name: string; email: string | null; passwordHash: string };
  try {
    data = JSON.parse(result.payload) as { name: string; email: string | null; passwordHash: string };
  } catch {
    return { step: "verify", phone, error: "That code is invalid or has expired.", callbackUrl };
  }
  try {
    await prisma.user.create({
      data: { name: data.name, email: data.email, phone, phoneVerifiedAt: new Date(), passwordHash: data.passwordHash },
    });
  } catch (e) {
    // Unique violation (race with a concurrent verify) → already registered.
    console.error("[Signup] user create failed (treating as already-registered)", e);
    return { step: "verify", phone, error: "This number is already registered. Please sign in.", callbackUrl };
  }
  const suffix = callbackUrl && callbackUrl !== "/" ? `&callbackUrl=${encodeURIComponent(callbackUrl)}` : "";
  redirect(`/login?created=1${suffix}`);
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  console.log("[Login Action]: Starting...");
  const parsed = LoginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    console.warn("[Login Action]: Validation failed");
    return { error: "Invalid phone/email or password" };
  }

  const callbackUrl = safeCallbackUrl(formData.get("callbackUrl") as string | null);
  console.log(`[Login Action]: Attempting signIn with callbackUrl: ${callbackUrl}`);

  // Read role from the DB BEFORE signIn — auth() in the same request does not
  // reliably see the just-set session cookie under NextAuth v5 + JWT sessions.
  // This is one extra indexed lookup; the alternative (relying on auth() to
  // see the new cookie) silently sends admins to the wrong page on miss.
  const id = resolveIdentifier(parsed.data.identifier);
  const dbUser =
    id.kind === "phone"
      ? await prisma.user.findUnique({ where: { phone: id.value }, select: { role: true } })
      : await prisma.user.findUnique({ where: { email: id.value }, select: { role: true } });
  const role = dbUser?.role === "ADMIN" ? "ADMIN" : "CUSTOMER";

  try {
    await signIn("credentials", {
      identifier: parsed.data.identifier,
      password: parsed.data.password,
      redirect: false,
    });

    const redirectTo = chooseLoginRedirect(role, callbackUrl);
    console.log(`[Login Action]: signIn cookie set, role=${role}, redirectTo=${redirectTo}`);
    return { redirectTo };
  } catch (error) {
    if (error instanceof AuthError) {
      console.warn("[Login Action]: AuthError during signIn", error.type);
      return { error: "Invalid phone/email or password" };
    }
    console.error("[Login Action]: Unexpected error during signIn", error);
    throw error;
  }
}

export type ResetState =
  | { mode: "request" | "phone-code" | "email-sent"; phone?: string; error?: string; success?: string }
  | null;

const NEUTRAL_EMAIL_SENT = "If an account with that email exists, you'll receive a reset link shortly.";

export async function requestResetAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = RequestResetSchema.safeParse({ identifier: formData.get("identifier") });
  if (!parsed.success) return { mode: "request", error: "Enter your phone or email." };

  const id = resolveIdentifier(parsed.data.identifier);
  if (id.kind === "email") {
    const user = await prisma.user.findUnique({ where: { email: id.value } });
    if (user?.email) {
      try {
        await issuePasswordReset({ id: user.id, email: user.email });
      } catch (e) {
        console.error("[forgot-password] email reset failed:", e);
      }
    }
    return { mode: "email-sent", success: NEUTRAL_EMAIL_SENT };
  }

  // Phone path — neutral regardless of existence.
  const user = await prisma.user.findUnique({ where: { phone: id.value } });
  if (user) {
    try {
      await issueChallenge({ phone: id.value, purpose: "RESET" });
    } catch (e) {
      if (!(e instanceof ChallengeCooldownError)) console.error("[forgot-password] SMS reset failed:", e);
    }
  }
  return { mode: "phone-code", phone: id.value };
}

export async function resetByPhoneAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = ResetByPhoneSchema.safeParse({
    phone: formData.get("phone"),
    code: formData.get("code"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    const phoneRaw = formData.get("phone");
    return { mode: "phone-code", phone: typeof phoneRaw === "string" ? phoneRaw : undefined, error: flatten(parsed.error) };
  }
  const { phone, code, newPassword } = parsed.data;
  const result = await verifyChallenge({ phone, purpose: "RESET", code });
  if (!result.ok) return { mode: "phone-code", phone, error: "That code is invalid or has expired." };

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return { mode: "phone-code", phone, error: "That code is invalid or has expired." };

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  redirect("/login?reset=success");
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
