"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addNote } from "@/app/admin/orders/actions";

type Note = { id: string; authorEmail: string; body: string; createdAt: Date };

export function OrderNotes({ orderId, notes }: { orderId: string; notes: Note[] }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {notes.map((n) => <li key={n.id}>{n.createdAt.toLocaleDateString()} · {n.authorEmail} — {n.body}</li>)}
      </ul>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note…" className="mt-2 w-full rounded border px-2 py-1 text-sm" />
      <button disabled={pending || !body.trim()} className="mt-1 rounded-md border px-3 py-1 text-sm"
        onClick={() => start(async () => { const r = await addNote(orderId, body); if (r.success) setBody(""); else alert(r.error); router.refresh(); })}>Add note</button>
    </div>
  );
}
