// app/account/security/page.tsx
import { ChangePasswordForm } from "@/app/_components/account/change-password-form";

export default function SecurityPage() {
  return (
    <section className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Security</h1>
      <ChangePasswordForm />
    </section>
  );
}
