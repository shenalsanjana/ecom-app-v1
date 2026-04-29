// app/(auth)/forgot-password/page.tsx
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requestResetAction, type ActionState } from "@/app/(auth)/actions";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(requestResetAction, null);
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Reset your password</h1>
      {state?.success ? (
        <Alert className="mb-4">
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      ) : null}
      {state?.error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <p className="mb-4 text-sm text-muted-foreground">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>
      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <Link href="/login" className="mt-4 inline-block text-sm text-muted-foreground hover:text-foreground">
        Back to sign in
      </Link>
    </main>
  );
}
