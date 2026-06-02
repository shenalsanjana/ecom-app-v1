"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeRole } from "@/app/admin/customers/actions";

export function RoleControl({ userId, role, isSelf }: { userId: string; role: string; isSelf: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const target = role === "ADMIN" ? "CUSTOMER" : "ADMIN";
  const label = role === "ADMIN" ? "Demote to Customer" : "Promote to Admin";

  if (isSelf) return <span className="text-xs text-muted-foreground" title="You can't change your own role">Role: {role} (you)</span>;

  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`${label}?`)) return;
        start(async () => { const r = await changeRole(userId, target as "ADMIN" | "CUSTOMER"); alert(r.success ? "Role updated" : r.error); router.refresh(); });
      }}
      className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
    >
      {label}
    </button>
  );
}
