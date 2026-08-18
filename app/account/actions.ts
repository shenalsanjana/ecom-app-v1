// app/account/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { getVerifiedSessionUser } from "@/app/_lib/session-user";
import { prisma } from "@/app/_lib/prisma";
import {
  ProfileSchema,
  ChangePasswordSchema,
  AddressSchema,
} from "@/app/_lib/validation";
import type { ActionState } from "@/app/(auth)/actions";

function flatten(errs: unknown): string {
  if (typeof errs === "object" && errs && "issues" in errs) {
    const issues = (errs as { issues: { message: string }[] }).issues;
    return issues.map((i) => i.message).join("; ");
  }
  return "Invalid input";
}

async function requireUserId(): Promise<string> {
  // Verified against the database, not merely read off the JWT: a valid session
  // cookie can name a User row that no longer exists, and address.create() would
  // then violate `Address_userId_fkey`. A stale session is not authenticated.
  const sessionUser = await getVerifiedSessionUser();
  if (!sessionUser) throw new Error("Not authenticated");
  return sessionUser.id;
}

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = ProfileSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) return { error: flatten(parsed.error) };

  const current = await prisma.user.findUnique({ where: { id: userId } });
  if (!current) return { error: "Account not found" };

  const nextEmail = parsed.data.email?.trim() ? parsed.data.email.trim() : null;
  if (nextEmail !== current.email) {
    if (nextEmail) {
      const taken = await prisma.user.findUnique({ where: { email: nextEmail } });
      if (taken && taken.id !== current.id) return { error: "Email already in use" };
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { name: parsed.data.name, email: nextEmail },
  });

  // Busts the /account router cache. We deliberately do NOT
  // revalidatePath("/") here — post Phase A of perf-isr-public-catalog,
  // SiteHeader is client-hydrated via useSession(), so the home-page
  // SSR HTML doesn't encode profile data. Busting "/" would nuke the
  // home-page ISR cache on every profile edit.
  revalidatePath("/account");
  return { success: "Profile updated" };
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = ChangePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: flatten(parsed.error) };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "Account not found" };
  if (!user.passwordHash) return { error: "Current password is incorrect" };

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return { error: "Current password is incorrect" };

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  return { success: "Password updated" };
}

export async function addAddressAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const parsed = AddressSchema.safeParse({
    label: formData.get("label"),
    line1: formData.get("line1"),
    line2: formData.get("line2") || null,
    city: formData.get("city"),
    country: formData.get("country"),
    isDefault: formData.get("isDefault") === "on",
  });
  if (!parsed.success) return { error: flatten(parsed.error) };

  await prisma.$transaction(async (tx) => {
    if (parsed.data.isDefault) {
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    await tx.address.create({
      data: {
        ...parsed.data,
        userId,
        line2: parsed.data.line2 ?? null,
      },
    });
  });

  revalidatePath("/account/addresses");
  return { success: "Address added" };
}

export async function updateAddressAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await requireUserId();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return { error: "Missing address id" };

  const owned = await prisma.address.findUnique({ where: { id } });
  if (!owned || owned.userId !== userId) return { error: "Address not found" };

  const parsed = AddressSchema.safeParse({
    label: formData.get("label"),
    line1: formData.get("line1"),
    line2: formData.get("line2") || null,
    city: formData.get("city"),
    country: formData.get("country"),
    isDefault: formData.get("isDefault") === "on",
  });
  if (!parsed.success) return { error: flatten(parsed.error) };

  await prisma.$transaction(async (tx) => {
    if (parsed.data.isDefault) {
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    await tx.address.update({
      where: { id },
      data: {
        ...parsed.data,
        line2: parsed.data.line2 ?? null,
      },
    });
  });

  revalidatePath("/account/addresses");
  return { success: "Address updated" };
}

export async function deleteAddressAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  const owned = await prisma.address.findUnique({ where: { id } });
  if (!owned || owned.userId !== userId) return;
  await prisma.address.delete({ where: { id } });
  revalidatePath("/account/addresses");
}

export async function setDefaultAddressAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  const owned = await prisma.address.findUnique({ where: { id } });
  if (!owned || owned.userId !== userId) return;

  await prisma.$transaction([
    prisma.address.updateMany({ where: { userId }, data: { isDefault: false } }),
    prisma.address.update({ where: { id }, data: { isDefault: true } }),
  ]);
  revalidatePath("/account/addresses");
}
