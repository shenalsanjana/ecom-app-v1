"use client";
import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

// Upload one file and return its public URL. Production goes straight to Vercel
// Blob (bypasses the 4.5MB body cap); local dev saves into /public/uploads.
async function uploadOne(file: File): Promise<string> {
  if (process.env.NODE_ENV === "production") {
    const blob = await upload(file.name, file, {
      access: "public",
      handleUploadUrl: "/api/admin/upload",
    });
    return blob.url;
  }
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/admin/upload-local", { method: "POST", body: fd });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Upload failed (${res.status})`);
  }
  return ((await res.json()) as { url: string }).url;
}

// Shared "upload from device" primitive. Reused by the category image, the
// product main image (single), and the gallery (multiple). Pass `multiple` to
// allow selecting several files at once; URLs are returned in the picked order
// via onUploadedMany. Single-file callers use onUploaded.
export function UploadButton({
  onUploaded,
  onUploadedMany,
  multiple = false,
  label = "Upload",
  className = "rounded border px-2 py-1.5 text-sm whitespace-nowrap disabled:opacity-50",
}: {
  onUploaded?: (url: string) => void;
  onUploadedMany?: (urls: string[]) => void;
  multiple?: boolean;
  label?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = ""; // reset so picking the same file(s) again re-fires onChange
    if (files.length === 0) return;

    setBusy(true);
    try {
      // allSettled so one bad file doesn't discard the others; order preserved.
      const results = await Promise.allSettled(files.map(uploadOne));
      const urls = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
        .map((r) => r.value);

      if (urls.length > 0) {
        if (onUploadedMany) onUploadedMany(urls);
        else if (onUploaded) urls.forEach(onUploaded);
      }

      const failed = results.length - urls.length;
      if (failed > 0) {
        const firstErr = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
        const reason = firstErr?.reason instanceof Error ? firstErr.reason.message : "Upload failed";
        alert(`${failed} of ${results.length} upload(s) failed: ${reason}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" multiple={multiple} hidden onChange={handleFiles} />
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
