// app/(auth)/login/page.tsx
"use client";

import { useActionState, use, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { loginAction, type ActionState } from "@/app/(auth)/actions";

type Props = { searchParams: Promise<{ callbackUrl?: string; reset?: string; created?: string }> };

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
  searchParams: Promise<{ callbackUrl?: string; reset?: string; created?: string }>;
}) {
  const params = use(searchParams);
  const router = useRouter();
  const { update } = useSession();
  const target = state?.redirectTo;

  // Redirect exactly once after a successful login. update() refreshes the
  // client SessionProvider so navbar consumers reflect the new login, but it
  // also mutates session context — which re-renders this component and changes
  // the `update` identity, re-firing this effect. The ref guard makes the body
  // run a single time so we don't loop. We deliberately do NOT call
  // router.refresh() here: it re-fetches the current (/login) RSC tree and
  // aborts the in-flight push to a slower, auth-gated target like /admin.
  const didRedirect = useRef(false);
  useEffect(() => {
    if (!target || didRedirect.current) return;
    didRedirect.current = true;
    (async () => {
      try {
        await update();
      } catch {
        // A failed session refresh must not strand the user on "Signing in…".
      }
      router.push(target);
    })();
  }, [target, router, update]);

  const busy = pending || !!target;

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
        ← Back to home
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Sign in</h1>
      {params.created === "1" ? (
        <Alert className="mb-4">
          <AlertDescription>Account created. Sign in to continue.</AlertDescription>
        </Alert>
      ) : null}
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
          <Label htmlFor="identifier">Phone or email</Label>
          <Input
            id="identifier"
            name="identifier"
            type="text"
            required
            autoComplete="username"
            placeholder="0771234567 or you@email.com"
            disabled={busy}
            data-testid="login-identifier"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required autoComplete="current-password" disabled={busy} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
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
