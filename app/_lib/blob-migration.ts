// app/_lib/blob-migration.ts
//
// Pure helpers for the one-time Vercel Blob -> local disk image cutover
// (scripts/migrate-images-from-blob.ts). Kept separate from that script's
// fetch/fs/Prisma I/O so the URL-matching and filename logic can be unit
// tested without a database or network.
import path from "node:path";
import { randomUUID } from "node:crypto";

export const BLOB_HOSTNAME_SUFFIX = ".public.blob.vercel-storage.com";

export function isBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(BLOB_HOSTNAME_SUFFIX);
  } catch {
    return false;
  }
}

export function localFilenameFor(url: string): string {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname) || ".bin";
  const base =
    path
      .basename(pathname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .slice(0, 40) || "image";
  return `${base}-${randomUUID().slice(0, 8)}${ext}`;
}
