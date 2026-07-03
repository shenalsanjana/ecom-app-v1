// app/account/page.tsx
import { auth } from "@/app/_lib/auth";
import { prisma } from "@/app/_lib/prisma";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/app/_components/account/profile-form";

export default async function AccountProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/account");
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");
  return (
    <section className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Profile</h1>
      <ProfileForm name={user.name} email={user.email ?? ""} />
    </section>
  );
}
