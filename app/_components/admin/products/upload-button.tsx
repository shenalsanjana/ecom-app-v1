"use client";
import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

// Shared "upload from device" primitive. Picks a local image file, uploads it
// straight to Vercel Blob via the admin-gated /api/admin/upload route, and
// hands the resulting public URL back to the caller. Reused by the category
// image field, the product main image, and the gallery editor.
export function UploadButton({
  onUploaded,
  label = "Upload",
  className = "rounded border px-2 py-1.5 text-sm whitespace-nowrap disabled:opacity-50",
}: {
  onUploaded: (url: string) => void;
  label?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so picking the same file again re-fires onChange
    if (!file) return;

    setBusy(true);
    try {
      let url: string;
      if (process.env.NODE_ENV === "production") {
        // Production: upload straight to Vercel Blob (bypasses the 4.5MB body cap).
        const blob = await upload(file.name, file, {
          access: "public",
          handleUploadUrl: "/api/admin/upload",
        });
        url = blob.url;
      } else {
        // Local dev: no Blob token needed — save into /public/uploads.
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/admin/upload-local", { method: "POST", body: fd });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `Upload failed (${res.status})`);
        }
        url = ((await res.json()) as { url: string }).url;
      }
      onUploaded(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleFile} />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={className}
      >
        {busy ? "Uploading…" : label}
      </button>
    </>
  );
}
