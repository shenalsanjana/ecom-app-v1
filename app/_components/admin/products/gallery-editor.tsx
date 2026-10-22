"use client";
import { UploadButton } from "./upload-button";

export function GalleryEditor({ urls, onChange }: { urls: string[]; onChange: (u: string[]) => void }) {
  const set = (i: number, v: string) => onChange(urls.map((u, j) => (j === i ? v : u)));
  const remove = (i: number) => onChange(urls.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= urls.length) return;
    const next = [...urls];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {urls.map((u, i) => (
        <div key={i} className="flex items-center gap-1">
          {u.trim() && (
            <a
              href={u.trim()}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View full-size image ${i + 1}`}
              className="h-16 w-16 shrink-0 overflow-hidden rounded border bg-muted"
            >
              {/* A pasted admin URL may be outside next/image's allowlist. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u.trim()} alt={`Image ${i + 1} preview`} loading="lazy" className="h-full w-full object-contain" />
            </a>
          )}
          <button type="button" onClick={() => move(i, -1)} className="px-1 text-muted-foreground">↑</button>
          <button type="button" onClick={() => move(i, 1)} className="px-1 text-muted-foreground">↓</button>
          <input value={u} onChange={(e) => set(i, e.target.value)} placeholder="/products/…/2.jpg" className="min-w-0 flex-1 rounded border px-2 py-1 text-sm" />
          <button type="button" onClick={() => remove(i)} className="px-1 text-destructive">✕</button>
        </div>
      ))}
      <UploadButton multiple resizeTarget="product" label="⤴ Upload from device" onUploadedMany={(newUrls) => onChange([...urls, ...newUrls])} className="rounded border px-3 py-1 text-sm disabled:opacity-50" />

    </div>
  );
}
