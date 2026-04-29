// app/_components/account/change-password-form.tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { changePasswordAction } from "@/app/account/actions";
import type { ActionState } from "@/app/(auth)/actions";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(changePasswordAction, null);
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
          <Label htmlFor="currentPassword">Current password</Label>
          <Input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPassword">New password</Label>
          <Input id="newPassword" name="newPassword" type="password" required autoComplete="new-password" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input id="confirmPassword" name="confirmPassword" type="password" required autoComplete="new-password" />
        </div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Change password"}</Button>
      </form>
    </>
  );
}
