// app/(auth)/signup/page.tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { signupAction, type ActionState } from "@/app/(auth)/actions";

type Props = { searchParams: Promise<{ callbackUrl?: string }> };

export default function SignupPage({ searchParams }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signupAction, null);
  return (
    <SignupInner state={state} formAction={formAction} pending={pending} searchParams={searchParams} />
  );
}

function SignupInner({
  state,
  formAction,
  pending,
  searchParams,
}: {
  state: ActionState;
  formAction: (fd: FormData) => void;
  pending: boolean;
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const [params, setParams] = useState<{ callbackUrl?: string }>({});
  useEffect(() => {
    searchParams.then(setParams);
  }, [searchParams]);

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
        ← Back to home
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Create your account</h1>
      {state?.error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.success ? (
        <>
          <Alert className="mb-4">
            <AlertDescription>{state.success}</AlertDescription>
          </Alert>
          <Link
            href={params.callbackUrl ? `/login?callbackUrl=${encodeURIComponent(params.callbackUrl)}` : "/login"}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign in
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">
            Need a different email?{" "}
            <Link href="/signup" className="hover:text-foreground">Try again</Link>
          </p>
        </>
      ) : (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="callbackUrl" value={params.callbackUrl ?? "/"} />
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" required autoComplete="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
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
