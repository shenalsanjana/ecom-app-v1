// app/account/layout.tsx
import { redirect } from "next/navigation";
import { auth } from "@/app/_lib/auth";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";
import { AccountSidebar } from "@/app/_components/account/account-sidebar";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/account");

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row lg:px-8">
          <AccountSidebar userName={session.user.name ?? session.user.email ?? "Account"} />
          <div className="flex-1">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
