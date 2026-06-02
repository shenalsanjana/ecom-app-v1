"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/app/_lib/prisma";
import { requireAdmin } from "@/app/_lib/admin-auth";
import { countAdmins } from "@/app/_lib/admin-customers";
import { issuePasswordReset } from "@/app/_lib/password-reset";

export type ActionResult = { success: true } | { success: false; error: string };

const ROLES = ["ADMIN", "CUSTOMER"] as const;
type Role = (typeof ROLES)[number];

function revalidate(id: string) {
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${id}`);
}

export async function changeRole(userId: string, role: Role): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!ROLES.includes(role)) return { success: false, error: "Invalid role" };
  if (userId === session.user.id) return { success: false, error: "You can't change your own role" };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { success: false, error: "User not found" };

  // Best-effort last-admin guard. The count + update aren't transactional, so a
  // simultaneous demotion of the last two admins could in theory slip through;
  // negligible at this scale (1–2 admins) and recoverable via the admin CLI.
  if (role === "CUSTOMER" && user.role === "ADMIN" && (await countAdmins()) <= 1) {
    return { success: false, error: "Can't demote the last admin" };
  }

  try {
    await prisma.user.update({ where: { id: userId }, data: { role } });
  } catch {
    return { success: false, error: "Something went wrong. Please try again." };
  }
  revalidate(userId);
  return { success: true };
}

export async function sendPasswordReset(userId: string): Promise<ActionResult> {
  await requireAdmin();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) return { success: false, error: "User not found" };

  try {
    await issuePasswordReset(user);
  } catch {
    return { success: false, error: "Couldn't send the reset email." };
  }
  return { success: true };
}
