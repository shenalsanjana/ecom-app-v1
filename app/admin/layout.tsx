// Admin chrome. requireAdmin() is the layer-2 server-side guard; the
// proxy.ts edge gate is layer 1 (spec #1).
import { requireAdmin } from "@/app/_lib/admin-auth";
import { AdminTopBar } from "@/app/_components/admin/admin-top-bar";
import { AdminSidebar } from "@/app/_components/admin/admin-sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const userLabel = session.user.name || session.user.email || "Admin";

  return (
    <div className="flex min-h-screen flex-col">
      <AdminTopBar userLabel={userLabel} />
      <div className="flex flex-1">
        <AdminSidebar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
