import bcrypt from "bcryptjs";
import { prisma } from "@/app/_lib/prisma";

export const ADMIN = {
  email: "e2e-admin@dressingbear.test",
  password: "E2eAdminPass1",
  name: "E2E Admin",
} as const;

export const CUSTOMER = {
  email: "e2e-customer@dressingbear.test",
  password: "E2eCustomerPass1",
  name: "E2E Customer",
} as const;

const BCRYPT_COST = 10;
const TEST_EMAILS = [ADMIN.email, CUSTOMER.email];

export async function seedTestUsers(): Promise<void> {
  await prisma.user.deleteMany({ where: { email: { in: TEST_EMAILS } } });
  const [adminHash, customerHash] = await Promise.all([
    bcrypt.hash(ADMIN.password, BCRYPT_COST),
    bcrypt.hash(CUSTOMER.password, BCRYPT_COST),
  ]);
  await prisma.user.create({
    data: {
      email: ADMIN.email,
      name: ADMIN.name,
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });
  await prisma.user.create({
    data: {
      email: CUSTOMER.email,
      name: CUSTOMER.name,
      passwordHash: customerHash,
      role: "CUSTOMER",
    },
  });
}

export async function deleteTestUsers(): Promise<void> {
  await prisma.user.deleteMany({ where: { email: { in: TEST_EMAILS } } });
  await prisma.$disconnect();
}
