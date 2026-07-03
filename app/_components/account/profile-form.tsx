// app/_components/account/profile-form.tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updateProfileAction } from "@/app/account/actions";
import type { ActionState } from "@/app/(auth)/actions";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateProfileAction, null);
  return (
    <>
      {state?.error ? (
        <Alert variant="destructive" className="mb-4"><AlertDescription>{state.error}</AlertDescription></Alert>
      ) : null}
      {state?.success ? (
        <Alert className="mb-4"><AlertDescription>{state.success}</AlertDescription></Alert>
      ) : null}
      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" name="name" defaultValue={name} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email (optional)</Label>
          <Input id="email" name="email" type="email" defaultValue={email} />
        </div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
      </form>
    </>
  );
}
