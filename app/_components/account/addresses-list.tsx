// app/_components/account/addresses-list.tsx
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddressForm } from "@/app/_components/account/address-form";
import {
  addAddressAction,
  updateAddressAction,
  deleteAddressAction,
  setDefaultAddressAction,
} from "@/app/account/actions";

type Address = {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

export function AddressesList({ addresses }: { addresses: Address[] }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        {adding ? (
          <Card>
            <CardHeader><CardTitle className="text-base">Add new address</CardTitle></CardHeader>
            <CardContent>
              <AddressForm action={addAddressAction} submitLabel="Add address" />
              <Button variant="ghost" className="mt-2" onClick={() => setAdding(false)}>Cancel</Button>
            </CardContent>
          </Card>
        ) : (
          <Button onClick={() => setAdding(true)}>Add new address</Button>
        )}
      </div>

      {addresses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No addresses yet.</p>
      ) : (
        <ul className="space-y-4">
          {addresses.map((a) => (
            <li key={a.id}>
              {editingId === a.id ? (
                <Card>
                  <CardHeader><CardTitle className="text-base">Edit address</CardTitle></CardHeader>
                  <CardContent>
                    <AddressForm action={updateAddressAction} initial={a} submitLabel="Save changes" />
                    <Button variant="ghost" className="mt-2" onClick={() => setEditingId(null)}>Cancel</Button>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base">{a.label}</CardTitle>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {a.line1}{a.line2 ? `, ${a.line2}` : ""}
                        <br />
                        {a.city}, {a.region} {a.postalCode}, {a.country}
                      </div>
                    </div>
                    {a.isDefault ? <Badge>Default</Badge> : null}
                  </CardHeader>
                  <CardContent className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingId(a.id)}>Edit</Button>
                    {!a.isDefault ? (
                      <form action={setDefaultAddressAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <Button variant="outline" size="sm" type="submit">Set as default</Button>
                      </form>
                    ) : null}
                    <form action={deleteAddressAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <Button variant="ghost" size="sm" type="submit">Delete</Button>
                    </form>
                  </CardContent>
                </Card>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
