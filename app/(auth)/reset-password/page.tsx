// app/(auth)/reset-password/page.tsx
"use client";

import { use, useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { resetPasswordAction, type ActionState } from "@/app/(auth)/actions";

type Props = { searchParams: Promise<{ token?: string }> };

export default function ResetPasswordPage({ searchParams }: Props) {
  // Read the token DURING render (like login/signup do). This is a dynamic API,
  // so it opts the route into dynamic rendering and the real `?token=…` is
  // available. Reading it only in a useEffect (the previous approach) let the
  // page be statically prerendered, so `searchParams` resolved empty in
  // production and every reset link rendered "invalid or has expired".
  const { token } = use(searchParams);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(resetPasswordAction, null);

  if (!token) {
    return (
      <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-10">
        <Alert variant="destructive">
          <AlertDescription>This reset link is invalid or has expired.</AlertDescription>
        </Alert>
        <Link href="/forgot-password" className="mt-4 text-sm text-muted-foreground hover:text-foreground">
          Request a new reset link
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Set a new password</h1>
      {state?.error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div className="space-y-2">
          <Label htmlFor="newPassword">New password</Label>
          <Input id="newPassword" name="newPassword" type="password" required autoComplete="new-password" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" />
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </main>
  );
}
