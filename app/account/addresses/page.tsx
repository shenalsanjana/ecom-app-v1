// app/account/addresses/page.tsx
import { auth } from "@/app/_lib/auth";
import { prisma } from "@/app/_lib/prisma";
import { redirect } from "next/navigation";
import { AddressesList } from "@/app/_components/account/addresses-list";

export default async function AddressesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/account/addresses");
  const addresses = await prisma.address.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return (
    <section>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Saved addresses</h1>
      <AddressesList
        addresses={addresses.map((a) => ({
          id: a.id,
          label: a.label,
          line1: a.line1,
          line2: a.line2,
          city: a.city,
          region: a.region,
          postalCode: a.postalCode,
          country: a.country,
          isDefault: a.isDefault,
        }))}
      />
    </section>
  );
}
