// app/(auth)/login/page.tsx
"use client";

import { useActionState, use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { loginAction, type ActionState } from "@/app/(auth)/actions";

type Props = { searchParams: Promise<{ callbackUrl?: string; reset?: string }> };

export default function LoginPage({ searchParams }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(loginAction, null);
  return (
    <LoginInner state={state} formAction={formAction} pending={pending} searchParams={searchParams} />
  );
}

function LoginInner({
  state,
  formAction,
  pending,
  searchParams,
}: {
  state: ActionState;
  formAction: (fd: FormData) => void;
  pending: boolean;
  searchParams: Promise<{ callbackUrl?: string; reset?: string }>;
}) {
  const params = use(searchParams);

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
        ← Back to home
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Sign in</h1>
      {params.reset === "success" ? (
        <Alert className="mb-4">
          <AlertDescription>Password updated. You can now sign in with your new password.</AlertDescription>
        </Alert>
      ) : null}
      {state?.error ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="callbackUrl" value={params.callbackUrl ?? "/"} />
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground">
          Forgot password?
        </Link>
        <Link
          href={params.callbackUrl ? `/signup?callbackUrl=${encodeURIComponent(params.callbackUrl)}` : "/signup"}
          className="text-muted-foreground hover:text-foreground"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}
