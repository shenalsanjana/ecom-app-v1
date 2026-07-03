// app/(auth)/signup/page.tsx
"use client";

import { useActionState, use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { signupAction, type SignupState } from "@/app/(auth)/actions";

type Props = { searchParams: Promise<{ callbackUrl?: string }> };

export default function SignupPage({ searchParams }: Props) {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(signupAction, null);
  const params = use(searchParams);
  const callbackUrl = params.callbackUrl ?? "/";
  const step = state?.step === "verify" ? "verify" : "details";

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
        ← Back to home
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {step === "verify" ? "Enter your code" : "Create your account"}
      </h1>
      {state?.error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      {step === "verify" ? (
        <form action={formAction} className="space-y-4" data-testid="signup-verify-form">
          <input type="hidden" name="step" value="verify" />
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <input type="hidden" name="phone" value={state?.phone ?? ""} />
          <p className="text-sm text-muted-foreground">
            We sent a 6-digit code by SMS to {state?.phone}. Enter it below.
          </p>
          <div className="space-y-2">
            <Label htmlFor="code">Verification code</Label>
            <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code"
                   pattern="\d{6}" maxLength={6} required disabled={pending} data-testid="signup-code" />
          </div>
          <Button type="submit" className="w-full" disabled={pending} data-testid="signup-verify">
            {pending ? "Verifying…" : "Verify & create account"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Wrong number?{" "}
            <Link href="/signup" className="hover:text-foreground">Start over</Link>
          </p>
        </form>
      ) : (
        <form action={formAction} className="space-y-4" data-testid="signup-details-form">
          <input type="hidden" name="step" value="request" />
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" required autoComplete="name" disabled={pending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Mobile number</Label>
            <Input id="phone" name="phone" type="tel" inputMode="tel" required
                   autoComplete="tel" placeholder="0771234567" disabled={pending} data-testid="signup-phone" />
            <p className="text-xs text-muted-foreground">We&apos;ll text you a code to verify it.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="email" name="email" type="email" autoComplete="email" disabled={pending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required autoComplete="new-password" disabled={pending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" disabled={pending} />
          </div>
          <Button type="submit" className="w-full" disabled={pending} data-testid="signup-submit">
            {pending ? "Sending code…" : "Continue"}
          </Button>
        </form>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={params.callbackUrl ? `/login?callbackUrl=${encodeURIComponent(params.callbackUrl)}` : "/login"}
          className="hover:text-foreground"
        >
          Sign in
        </Link>
      </p>
    </main>
  );
}
