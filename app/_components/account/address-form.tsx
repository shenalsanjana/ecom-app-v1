// app/_components/account/address-form.tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionState } from "@/app/(auth)/actions";

type Address = {
  id?: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

type Props = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  initial?: Address;
  submitLabel: string;
};

export function AddressForm({ action, initial, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  return (
    <>
      {state?.error ? (
        <Alert variant="destructive" className="mb-4"><AlertDescription>{state.error}</AlertDescription></Alert>
      ) : null}
      {state?.success ? (
        <Alert className="mb-4"><AlertDescription>{state.success}</AlertDescription></Alert>
      ) : null}
      <form action={formAction} className="grid gap-4 sm:grid-cols-2">
        {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="label">Label</Label>
          <Input id="label" name="label" defaultValue={initial?.label ?? ""} required />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="line1">Address line 1</Label>
          <Input id="line1" name="line1" defaultValue={initial?.line1 ?? ""} required />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="line2">Address line 2 (optional)</Label>
          <Input id="line2" name="line2" defaultValue={initial?.line2 ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input id="city" name="city" defaultValue={initial?.city ?? ""} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="region">State / Province</Label>
          <Input id="region" name="region" defaultValue={initial?.region ?? ""} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="postalCode">Postal code</Label>
          <Input id="postalCode" name="postalCode" defaultValue={initial?.postalCode ?? ""} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="country">Country (ISO-2)</Label>
          <Input
            id="country"
            name="country"
            defaultValue={initial?.country ?? "US"}
            maxLength={2}
            placeholder="US"
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            name="isDefault"
            defaultChecked={initial?.isDefault ?? false}
            className="h-4 w-4"
          />
          Make this my default address
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
        </div>
      </form>
    </>
  );
}
