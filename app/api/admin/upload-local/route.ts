// app/api/admin/upload-local/route.ts
// LOCAL-DEV ONLY fallback so image upload works without provisioning Vercel
// Blob. It accepts a multipart file and writes it into /public/uploads, which
// `next dev` serves at /uploads/<name>. It is hard-disabled in production
// because Vercel's runtime filesystem is read-only — production uploads go
// through /api/admin/upload (Blob client-upload) instead.
import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireAdminApi } from "@/app/_lib/admin-auth";

export const runtime = "nodejs";

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Local upload is disabled in production. Configure Vercel Blob (BLOB_READ_WRITE_TOKEN)." },
      { status: 400 },
    );
  }

  const guard = await requireAdminApi();
  if (guard instanceof Response) return guard;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type || "unknown"}` }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  const ext = (path.extname(file.name) || "").toLowerCase();
  const base =
    path.basename(file.name, path.extname(file.name)).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40) || "image";
  const filename = `${base}-${randomUUID().slice(0, 8)}${ext}`;

  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  return NextResponse.json({ url: `/uploads/${filename}` });
}
