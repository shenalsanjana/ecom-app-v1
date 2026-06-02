"use client";
import { useTransition } from "react";
import { sendPasswordReset } from "@/app/admin/customers/actions";

export function PasswordResetButton({ userId }: { userId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Email this customer a password-reset link?")) return;
        start(async () => { const r = await sendPasswordReset(userId); alert(r.success ? "Reset email sent" : r.error); });
      }}
      className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
    >
      ✉ Send password reset
    </button>
  );
}
