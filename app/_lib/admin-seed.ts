// app/_lib/admin-seed.ts
// Pure logic for creating or promoting an admin user. Called from
// scripts/create-admin.ts and any future admin-bootstrap path. Never
// invoked from user-facing request flows — admins are only created via
// the CLI.
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/app/_lib/prisma";
import { PasswordSchema } from "@/app/_lib/validation";

const InputSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: PasswordSchema,
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  promote: z.boolean().default(false),
});

export type CreateAdminInput = z.input<typeof InputSchema>;

export type CreateAdminResult =
  | { ok: true; action: "created" | "promoted"; userId: string }
  | {
      ok: false;
      reason: "already_admin" | "needs_promote_flag" | "invalid_input" | "unexpected_role";
      message: string;
    };

const BCRYPT_COST = 10;

export async function createAdminUser(input: CreateAdminInput): Promise<CreateAdminResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid_input",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  const { email, password, name, promote } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role === "ADMIN") {
      return {
        ok: false,
        reason: "already_admin",
        message: `User ${email} already exists as admin.`,
      };
    }
    if (existing.role !== "CUSTOMER") {
      // The DB column is a plain String, so unexpected values are possible
      // (manual edits, legacy data, future role rollouts). Refuse rather than
      // silently overwriting an unrecognized role.
      return {
        ok: false,
        reason: "unexpected_role",
        message: `User ${email} has unexpected role "${existing.role}". Manual intervention required.`,
      };
    }
    if (!promote) {
      return {
        ok: false,
        reason: "needs_promote_flag",
        message: `User ${email} exists as customer. Pass --promote to flip their role to admin (password unchanged).`,
      };
    }
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { role: "ADMIN" },
    });
    return { ok: true, action: "promoted", userId: updated.id };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const created = await prisma.user.create({
    data: { email, name, passwordHash, role: "ADMIN" },
  });
  return { ok: true, action: "created", userId: created.id };
}
