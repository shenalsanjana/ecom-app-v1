"use client";

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
          <button type="button" onClick={() => move(i, -1)} className="px-1 text-muted-foreground">↑</button>
          <button type="button" onClick={() => move(i, 1)} className="px-1 text-muted-foreground">↓</button>
          <input value={u} onChange={(e) => set(i, e.target.value)} placeholder="/products/…/2.jpg" className="flex-1 rounded border px-2 py-1 text-sm" />
          <button type="button" onClick={() => remove(i)} className="px-1 text-destructive">✕</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...urls, ""])} className="rounded border px-3 py-1 text-sm">＋ Add gallery image</button>
    </div>
  );
}
