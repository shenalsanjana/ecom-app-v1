// app/(auth)/forgot-password/page.tsx
"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requestResetAction, resetByPhoneAction, type ResetState } from "@/app/(auth)/actions";

export default function ForgotPasswordPage() {
  const [reqState, requestAction, reqPending] = useActionState<ResetState, FormData>(requestResetAction, null);
  const [setState, setAction, setPending] = useActionState<ResetState, FormData>(resetByPhoneAction, null);

  const inPhoneCode = reqState?.mode === "phone-code";

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Reset your password</h1>

      {reqState?.success ? (
        <Alert className="mb-4">
          <AlertDescription>{reqState.success}</AlertDescription>
        </Alert>
      ) : null}
      {reqState?.error || setState?.error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{reqState?.error || setState?.error}</AlertDescription>
        </Alert>
      ) : null}

      {inPhoneCode ? (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            If an account exists for {reqState?.phone}, we sent a 6-digit code by SMS. Enter it and choose a new password.
          </p>
          <form action={setAction} className="space-y-4">
            <input type="hidden" name="phone" value={reqState?.phone ?? ""} />
            <div className="space-y-2">
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                disabled={setPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input id="newPassword" name="newPassword" type="password" required autoComplete="new-password" disabled={setPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" disabled={setPending} />
            </div>
            <Button type="submit" className="w-full" disabled={setPending}>
              {setPending ? "Saving…" : "Save new password"}
            </Button>
          </form>
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            Enter your phone or email. We&apos;ll text a code (phone) or email a link.
          </p>
          <form action={requestAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">Phone or email</Label>
              <Input
                id="identifier"
                name="identifier"
                type="text"
                required
                autoComplete="username"
                placeholder="0771234567 or you@email.com"
                disabled={reqPending}
              />
            </div>
            <Button type="submit" className="w-full" disabled={reqPending}>
              {reqPending ? "Sending…" : "Continue"}
            </Button>
          </form>
        </>
      )}

      <Link href="/login" className="mt-4 inline-block text-sm text-muted-foreground hover:text-foreground">
        Back to sign in
      </Link>
    </main>
  );
}
