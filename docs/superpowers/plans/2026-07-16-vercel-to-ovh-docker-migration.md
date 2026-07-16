# Vercel-to-OVH Docker Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dockerize Dressing Bear for production deployment on an OVHcloud VPS-1 (Docker Compose: app + PostgreSQL + Nginx, Let's Encrypt TLS), fully removing the Vercel dependency (Vercel Blob → local-disk uploads, `vercel.json` and the Vercel-coupled migration workflow removed) with no business-logic changes.

**Architecture:** A 4-stage Dockerfile (`deps` → `tools` → `builder` → `runner`) produces a lean non-root production image via Next's `output: "standalone"`, plus a `tools`-stage "migrator" image (full toolchain, no DB dependency) for running Prisma migrations/seed/admin-bootstrap as one-off `docker compose run` invocations. Docker Compose wires `postgres` (loopback-only port, named volume), `app`, `migrator` (tools profile), and `nginx` (only service publishing 80/443) together on one internal network. Existing Vercel-Blob-hosted images get a one-time migration script to local disk backed by a Docker volume.

**Tech Stack:** Next.js 16 (App Router), Prisma/PostgreSQL, Docker Compose, Nginx, Let's Encrypt (certbot), Bash, Vitest.

## Global Constraints

- Target: OVHcloud VPS-1, Ubuntu 24.04 LTS, 2 vCores, 4GB RAM, 40GB NVMe.
- Domain: `dressingbear.com` (already owned; VPS not yet provisioned).
- Base image for anything running Node/Prisma: `node:22-slim` (Debian), never Alpine — Prisma's default binary target is `debian-openssl-3.0.x`; Alpine's musl libc breaks the query engine unless `binaryTargets` is overridden, and complicates `sharp`.
- Containers run as non-root wherever possible (`USER node` for the app).
- PostgreSQL is never exposed to the public internet. The one exception — binding to `127.0.0.1:5432` only, for build-time DB access — is documented, not implicit (see Task 7).
- Only `nginx` publishes ports (80/443) to the host.
- No `docker compose down -v` in any script (would delete the Postgres volume).
- `.env` is never committed; `.env*` is already covered by the repo's `.gitignore` (no change needed there).
- No secrets baked into image layers — build-time `DATABASE_URL` is passed via a BuildKit secret mount, never a build `ARG`.
- No business-logic changes except what self-hosting strictly requires (Vercel Blob → local disk).
- This dev environment has **no Docker installed and no local Postgres** — every task's "verification" step is scoped to what's actually runnable here (`npm test`, `npx tsc --noEmit`, `npm run lint`, static file review). Anything requiring a container runtime or a database is explicitly deferred to the VPS and called out as such.
- Full spec: `docs/superpowers/specs/2026-07-16-vercel-to-ovh-docker-migration-design.md`.

---

### Task 1: Add `/api/health` endpoint

**Files:**
- Create: `app/api/health/route.ts`
- Test: `app/api/health/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `prisma` singleton from `app/_lib/prisma.ts` (exports `prisma: PrismaClient`).
- Produces: `GET` handler returning `NextResponse` with `{ status: "ok" }` (200) or `{ status: "error" }` (500). Consumed by: the Dockerfile `HEALTHCHECK` (Task 6) and Compose's `depends_on: app: condition: service_healthy` for `nginx` (Task 8).

- [ ] **Step 1: Write the failing test**

Create `app/api/health/__tests__/route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    $queryRaw: queryRaw,
  },
}));

import { GET } from "../route";

describe("GET /api/health", () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  it("returns 200 ok when the database responds", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("returns 500 when the database query fails", async () => {
    queryRaw.mockRejectedValue(new Error("connection refused"));

    const res = await GET();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ status: "error" });
  });

  it("does not leak error details in the response body", async () => {
    queryRaw.mockRejectedValue(new Error("password authentication failed for user \"app\""));

    const res = await GET();
    const body = await res.json();

    expect(JSON.stringify(body)).not.toContain("password");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/api/health/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '../route'` (route.ts doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `app/api/health/route.ts`:

```typescript
// app/api/health/route.ts
//
// Unauthenticated liveness/readiness check for the Docker HEALTHCHECK and
// Compose's `depends_on: condition: service_healthy`. Deliberately returns
// no error detail (no stack trace, no DB error message) — unlike
// app/api/debug-db/route.ts, which is a separate, pre-existing endpoint out
// of scope for this change.
import { NextResponse } from "next/server";
import { prisma } from "@/app/_lib/prisma";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app/api/health/__tests__/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/health/route.ts app/api/health/__tests__/route.test.ts
git commit -m "feat(health): add /api/health endpoint for Docker healthchecks"
```

---

### Task 2: Enable standalone output, add `sharp`, drop the Vercel Blob remote pattern

**Files:**
- Modify: `next.config.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `next build` now emits `.next/standalone/server.js` (consumed by the Dockerfile `runner` stage in Task 6, which copies `.next/standalone`, `.next/static`, and `public/`).

- [ ] **Step 1: Add `output: "standalone"` and drop the Blob remote pattern**

Edit `next.config.ts` — replace the whole file with:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
    ],
    // Demo product images are SVG. Safe here because they are local files in
    // /public/products that we author ourselves.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
```

(The `*.public.blob.vercel-storage.com` remote pattern is removed — after Task 3/4, no image URLs point there anymore.)

- [ ] **Step 2: Add `sharp` as an explicit production dependency**

Edit `package.json` — in the `dependencies` block, add `sharp` alphabetically after `react-markdown`:

```json
    "react-markdown": "^10.1.0",
    "shadcn": "^4.5.0",
    "sharp": "^0.34.5",
```

(`sharp` is currently only an optional transitive dependency of `next`, used for Next's built-in image optimization. Making it explicit guarantees it's installed and its native binary is present in the Docker image rather than relying on `next`'s optional-dependency resolution.)

- [ ] **Step 3: Reinstall and verify**

Run: `npm install`
Expected: `sharp` appears in `package-lock.json` under `dependencies` (not just as a nested `next` optional dep) and installs without error.

Run: `npx tsc --noEmit`
Expected: no new errors (config-only change, no type surface affected).

*Note: `npm run build` cannot be verified in this session — it requires a reachable `DATABASE_URL` (several pages use ISR and query the DB at build time; there's no local Postgres in this dev environment, a pre-existing constraint, not something this task introduces). This gets verified on the VPS as part of the first Docker image build (Task 7).*

- [ ] **Step 4: Commit**

```bash
git add next.config.ts package.json package-lock.json
git commit -m "build: enable standalone output, add explicit sharp dependency"
```

---

### Task 3: Replace Vercel Blob uploads with local-disk-only storage

**Files:**
- Modify: `app/api/admin/upload-local/route.ts`
- Modify: `app/_components/admin/products/upload-button.tsx`
- Delete: `app/api/blob/upload/route.ts`
- Modify: `package.json` (remove `@vercel/blob`)

**Interfaces:**
- Produces: `POST /api/admin/upload-local` — multipart `FormData` with a `file` field in, `{ url: string }` JSON out (`url` shaped `/uploads/<filename>`). This is now the **only** upload path (previously prod-only via Blob, dev-only via this route). Consumed by: `upload-button.tsx`'s `uploadOne()`, and the mounted `uploads` Docker volume (Task 7) which makes `public/uploads/` persistent.

- [ ] **Step 1: Remove the production gate from the local upload route**

Edit `app/api/admin/upload-local/route.ts` — replace the whole file with:

```typescript
// app/api/admin/upload-local/route.ts
//
// Admin image upload. Writes into /app/public/uploads (a persistent Docker
// named volume in production — see docker-compose.yml), which Next's static
// public/ handling serves at /uploads/<name>. This is the only upload path;
// Vercel Blob (previously used in production) has been removed entirely —
// see docs/superpowers/specs/2026-07-16-vercel-to-ovh-docker-migration-design.md.
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
```

- [ ] **Step 2: Simplify the upload button to always use the local route**

Edit `app/_components/admin/products/upload-button.tsx` — remove the `@vercel/blob/client` import and replace `uploadOne`:

Old:
```typescript
import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { resizeImageFile, type ResizeTarget } from "@/app/_lib/resize-image";

// Upload one file and return its public URL. Production goes straight to Vercel
// Blob (bypasses the 4.5MB body cap); local dev saves into /public/uploads.
async function uploadOne(file: File): Promise<string> {
  if (process.env.NODE_ENV === "production") {
    const blob = await upload(file.name, file, {
      access: "public",
      handleUploadUrl: "/api/blob/upload",
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
```

New:
```typescript
import { useRef, useState } from "react";
import { resizeImageFile, type ResizeTarget } from "@/app/_lib/resize-image";

// Upload one file to local disk (persistent Docker volume in production) and
// return its public URL.
async function uploadOne(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/admin/upload-local", { method: "POST", body: fd });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Upload failed (${res.status})`);
  }
  return ((await res.json()) as { url: string }).url;
}
```

- [ ] **Step 3: Delete the Vercel Blob upload route**

Run: `git rm -r app/api/blob`

- [ ] **Step 4: Remove `@vercel/blob` from dependencies**

Edit `package.json` — remove the line `"@vercel/blob": "^2.4.0",` from `dependencies`.

Run: `npm install`
Expected: `@vercel/blob` removed from `package-lock.json`; install succeeds.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: no errors (confirms no remaining `@vercel/blob` imports anywhere).

Run: `npm test`
Expected: all existing tests still pass (no test exercised the deleted Blob route or the removed branch).

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/upload-local/route.ts app/_components/admin/products/upload-button.tsx package.json package-lock.json
git rm -r app/api/blob 2>/dev/null || true
git commit -m "feat(uploads): replace Vercel Blob with local-disk storage"
```

---

### Task 4: One-time Blob-to-local image migration script

**Files:**
- Create: `app/_lib/blob-migration.ts`
- Test: `app/_lib/__tests__/blob-migration.test.ts`
- Create: `scripts/migrate-images-from-blob.ts`
- Modify: `package.json` (add `migrate:images` script)

**Interfaces:**
- Produces: `isBlobUrl(url: string): boolean`, `localFilenameFor(url: string): string`, `BLOB_HOSTNAME_SUFFIX: string` from `app/_lib/blob-migration.ts`. Consumed by `scripts/migrate-images-from-blob.ts`.
- Consumes: `prisma` singleton (`app/_lib/prisma.ts`); `Category.image` and `VariantImage.url` — the only two Blob-URL-bearing columns in `prisma/schema.prisma` (confirmed by grepping every model for image/url/photo-like fields during design).

- [ ] **Step 1: Write the failing test for the pure helpers**

Create `app/_lib/__tests__/blob-migration.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { isBlobUrl, localFilenameFor } from "../blob-migration";

describe("isBlobUrl", () => {
  it("returns true for a Vercel Blob public URL", () => {
    expect(isBlobUrl("https://abc123.public.blob.vercel-storage.com/products/shirt-xyz.png")).toBe(true);
  });

  it("returns false for a local uploads URL", () => {
    expect(isBlobUrl("/uploads/shirt-xyz.png")).toBe(false);
  });

  it("returns false for an unrelated https URL", () => {
    expect(isBlobUrl("https://picsum.photos/200")).toBe(false);
  });

  it("returns false for a malformed URL", () => {
    expect(isBlobUrl("not-a-url")).toBe(false);
  });
});

describe("localFilenameFor", () => {
  it("preserves the file extension", () => {
    const name = localFilenameFor("https://abc123.public.blob.vercel-storage.com/products/shirt-xyz.png");
    expect(name.endsWith(".png")).toBe(true);
  });

  it("sanitizes non-alphanumeric characters from the base name", () => {
    const name = localFilenameFor("https://abc123.public.blob.vercel-storage.com/products/shirt%20photo!!.jpg");
    expect(name).toMatch(/^[a-zA-Z0-9_-]+\.jpg$/);
  });

  it("falls back to a generic base name when the path has none", () => {
    const name = localFilenameFor("https://abc123.public.blob.vercel-storage.com/");
    expect(name).toMatch(/^image-[a-f0-9]{8}\.bin$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/_lib/__tests__/blob-migration.test.ts`
Expected: FAIL — `Cannot find module '../blob-migration'`.

- [ ] **Step 3: Implement the pure helpers**

Create `app/_lib/blob-migration.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- app/_lib/__tests__/blob-migration.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Write the orchestration script**

Create `scripts/migrate-images-from-blob.ts`:

```typescript
// scripts/migrate-images-from-blob.ts
//
// One-time cutover: downloads every image currently hosted on Vercel Blob
// (Category.image, VariantImage.url — the only two Blob-URL-bearing columns
// in the schema) into the local uploads volume and rewrites the DB rows to
// point at the new /uploads/<file> URL. Run once, after restoring the
// database dump and before pointing DNS at the new server (see
// DEPLOY_OVH.md). Safe to re-run — already-local URLs are skipped.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isBlobUrl, localFilenameFor, BLOB_HOSTNAME_SUFFIX } from "@/app/_lib/blob-migration";
import { prisma } from "@/app/_lib/prisma";

async function downloadToUploads(url: string): Promise<string> {
  const filename = localFilenameFor(url);
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);
  return `/uploads/${filename}`;
}

async function migrateCategories(): Promise<number> {
  const categories = await prisma.category.findMany({
    where: { image: { contains: BLOB_HOSTNAME_SUFFIX } },
  });
  let count = 0;
  for (const category of categories) {
    if (!isBlobUrl(category.image)) continue;
    const newUrl = await downloadToUploads(category.image);
    await prisma.category.update({
      where: { slug: category.slug },
      data: { image: newUrl },
    });
    console.log(`[migrate-images] Category ${category.slug}: ${category.image} -> ${newUrl}`);
    count++;
  }
  return count;
}

async function migrateVariantImages(): Promise<number> {
  const images = await prisma.variantImage.findMany({
    where: { url: { contains: BLOB_HOSTNAME_SUFFIX } },
  });
  let count = 0;
  for (const image of images) {
    if (!isBlobUrl(image.url)) continue;
    const newUrl = await downloadToUploads(image.url);
    await prisma.variantImage.update({
      where: { id: image.id },
      data: { url: newUrl },
    });
    console.log(`[migrate-images] VariantImage ${image.id}: ${image.url} -> ${newUrl}`);
    count++;
  }
  return count;
}

async function main(): Promise<void> {
  const categoryCount = await migrateCategories();
  const variantImageCount = await migrateVariantImages();
  console.log(
    `[migrate-images] Done. Migrated ${categoryCount} categories, ${variantImageCount} variant images.`,
  );
}

main()
  .catch((err) => {
    console.error("[migrate-images] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 6: Add the npm script**

Edit `package.json` — add to `scripts`, after `"curfox:seed"`:

```json
    "curfox:seed": "tsx scripts/seed-curfox-cities.ts",
    "migrate:images": "tsx scripts/migrate-images-from-blob.ts",
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all tests pass, including the 7 new `blob-migration` tests.

*Note: the script's actual I/O (downloading real Blob URLs, writing to the DB) is not exercised here — no DB, no network target. It's exercised for real during the one-time VPS cutover (DEPLOY_OVH.md), where the pure helpers this task unit-tests are the only part reused between the two contexts.*

- [ ] **Step 8: Commit**

```bash
git add app/_lib/blob-migration.ts app/_lib/__tests__/blob-migration.test.ts scripts/migrate-images-from-blob.ts package.json
git commit -m "feat(uploads): add one-time Vercel Blob to local-disk image migration script"
```

---

### Task 5: Production `.env.example`

**Files:**
- Create: `.env.example`

**Interfaces:**
- Produces: the canonical list of env var names consumed by `docker-compose.yml` (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL` — Task 7) and by the app itself (all others — compiled from a full-repo grep during the design audit, not the generic template the user supplied, since this codebase reads `AUTH_SECRET`/`AUTH_URL`, not `NEXTAUTH_SECRET`/`NEXTAUTH_URL`/`JWT_SECRET`/`SESSION_SECRET`, none of which exist in this code).

- [ ] **Step 1: Create the file**

Create `.env.example`:

```env
# Production environment for Docker Compose deployment on OVH.
# Copy to .env, fill in real values, and NEVER commit .env.
# See DEPLOY_OVH.md for the full deployment procedure.

NODE_ENV=production
PORT=3000
DOMAIN=dressingbear.com

# --- PostgreSQL (consumed directly by the `postgres` Compose service) ---
POSTGRES_DB=dressingbear
POSTGRES_USER=dressingbear
POSTGRES_PASSWORD=

# Must match the three POSTGRES_* values above and use the Compose service
# name "postgres" as the host (containers reach each other by service name
# on the internal Docker network).
DATABASE_URL=postgresql://dressingbear:CHANGE_ME@postgres:5432/dressingbear?schema=public

# --- Auth (NextAuth v5) ---
# This app reads AUTH_SECRET / AUTH_URL, not NEXTAUTH_SECRET / NEXTAUTH_URL /
# JWT_SECRET / SESSION_SECRET — those names don't exist anywhere in this
# codebase, so they're intentionally omitted here.
AUTH_SECRET=
AUTH_URL=https://dressingbear.com
APP_URL=https://dressingbear.com

# --- Default admin bootstrap (see README.md "Default Admin") ---
SAMPLE_ADMIN_EMAIL=
SAMPLE_ADMIN_PASSWORD=
SAMPLE_ADMIN_NAME=

# --- SMTP (order email notifications) ---
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# --- Brand ---
BRAND_NAME=Dressing Bear
BRAND_EMAIL=dressingbear@gmail.com
CONTACT_NUMBER=

# --- Notify.lk transactional SMS (signup/reset OTP + order notifications) ---
NOTIFY_LK_USER_ID=
NOTIFY_LK_API_KEY=
NOTIFY_LK_SENDER_ID=

# --- Meta / Facebook (optional; unset disables Pixel + tracking entirely) ---
NEXT_PUBLIC_META_PIXEL_ID=
NEXT_PUBLIC_KOKO_ENABLED=false
NEXT_PUBLIC_DEBUG_CART=

# --- PayHere ---
PAYHERE_MODE=live
PAYHERE_MERCHANT_ID=
PAYHERE_MERCHANT_SECRET=
PAYHERE_APP_ID=
PAYHERE_APP_SECRET=

# --- Koko (Pay in 3) ---
KOKO_ENABLED=false
KOKO_MODE=live
KOKO_MERCHANT_ID=
KOKO_API_KEY=
KOKO_PUBLIC_KEY=
KOKO_PRIVATE_KEY=
KOKO_PLUGIN_NAME=customapi
KOKO_PLUGIN_VERSION=1.0.1

# --- MintPay ---
MINTPAY_ENABLED=false
MINTPAY_MODE=live
MINTPAY_MERCHANT_ID=
MINTPAY_MERCHANT_SECRET=

# --- Royal Express / Curfox courier ---
ROYAL_EXPRESS_ENABLED=false
ROYAL_EXPRESS_USER=
ROYAL_EXPRESS_PASS=
ROYAL_EXPRESS_TENANT=royalexpress

CURFOX_MERCHANT_BUSINESS_ID=
CURFOX_BASE_URL=https://v2-operations.api.curfox.com
CURFOX_LOGIN_BASE_URL=https://v1.api.curfox.com
CURFOX_ORDER_CREATE_PATH=/api/merchant/order/single
CURFOX_WAYBILL_PDF_PATH_TEMPLATE=/api/merchant/order/print/{waybill_number}
CURFOX_ORIGIN_CITY_ID=
CURFOX_ORIGIN_WAREHOUSE_ID=
CURFOX_DEFAULT_WEIGHT_KG=1
```

- [ ] **Step 2: Verify**

Run: `git check-ignore .env` (from repo root, after `touch .env` temporarily if needed, or just inspect `.gitignore`)
Expected: `.env` is ignored (confirms the existing `.gitignore` rules — `.env*` / `!.env*.example` — cover the new file's real counterpart without needing changes; `.env.example` itself is NOT ignored, since it starts with `.env` but doesn't match the `!.env*.example` negation... verify this explicitly in Step 3).

- [ ] **Step 3: Confirm `.env.example` itself is tracked, not ignored**

Run: `git check-ignore -v .env.example`
Expected: **no output** (exit code 1) — meaning `.env.example` is NOT ignored, because `.gitignore` line 38 (`!.env*.example`) re-includes it. If this instead prints a matching rule, stop and fix `.gitignore` before continuing (would mean the file can never be committed).

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "docs: add production .env.example for Docker deployment"
```

---

### Task 6: Dockerfile + `.dockerignore`

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

**Interfaces:**
- Produces: build targets `deps`, `tools`, `builder`, `runner`. `tools` is consumed by the `migrator` Compose service (Task 7). `runner` is consumed by the `app` Compose service (Task 7).
- Consumes: `output: "standalone"` from `next.config.ts` (Task 2), `/api/health` from Task 1 (referenced by `HEALTHCHECK`).

- [ ] **Step 1: Create `.dockerignore`**

Create `.dockerignore`:

```
node_modules
.next
.git
.worktrees
.claude
.superpowers
docs
openspec
media
public/uploads
tests
coverage
playwright-report
test-results
*.tsbuildinfo
.env
.env.*
!.env.example
npm-debug.log*
.DS_Store
.vscode
*.md
!README.md
```

- [ ] **Step 2: Create the Dockerfile**

Create `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1.7

# ---- deps: install once, reused by every later stage ----------------------
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- tools: full toolchain, no build — target for the `migrator` service --
# Used to run `prisma migrate deploy` / `db seed` / `admin:ensure` as one-off
# `docker compose run` invocations. Deliberately does NOT run `next build`
# (which needs a reachable, already-migrated database — see the postgres
# service's port-binding comment in docker-compose.yml), so this image can
# always be built regardless of database state, breaking what would
# otherwise be a circular dependency between "build the migrator" and "run
# migrations before the app can build."
FROM node:22-slim AS tools
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate

# ---- builder: production Next.js build (needs DB access — see below) ------
FROM tools AS builder
# NEXT_PUBLIC_* vars are inlined into client bundles at build time by
# Next.js, not read at runtime — they must arrive as build ARGs (they're
# public by definition, safe as plain args, unlike DATABASE_URL below).
# Without these, Meta Pixel and the Koko promo surfaces would silently
# never activate even with the vars correctly set in .env at runtime.
ARG NEXT_PUBLIC_META_PIXEL_ID
ARG NEXT_PUBLIC_KOKO_ENABLED
ARG NEXT_PUBLIC_DEBUG_CART
ENV NEXT_PUBLIC_META_PIXEL_ID=$NEXT_PUBLIC_META_PIXEL_ID
ENV NEXT_PUBLIC_KOKO_ENABLED=$NEXT_PUBLIC_KOKO_ENABLED
ENV NEXT_PUBLIC_DEBUG_CART=$NEXT_PUBLIC_DEBUG_CART
# Several storefront pages use ISR (`export const revalidate = N`), which
# makes `next build` query the database at build time to prerender them.
# DATABASE_URL is passed as a BuildKit secret (never a build ARG) so the
# connection string never lands in an image layer or `docker history`.
# The docker-compose.yml `app` service's build config supplies this secret
# and sets `network: host` so this step can reach Postgres at 127.0.0.1:5432
# (see the postgres service's port-binding comment for why).
RUN --mount=type=secret,id=database_url \
    DATABASE_URL="$(cat /run/secrets/database_url)" npm run build

# ---- runner: lean production server ----------------------------------------
FROM node:22-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Next's standalone file tracer (@vercel/nft) resolves Prisma's native query
# engine binary at runtime, not via static `require()`, so it's unreliable
# about including node_modules/.prisma in the traced output. Copy it
# explicitly — without this, the app boots but every DB query fails,
# /api/health returns 500, the container never reports healthy, and (since
# nginx depends_on app: condition: service_healthy) the whole stack never
# comes up.
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma

# Persistent upload target — a named volume is mounted here at runtime
# (docker-compose.yml `uploads` volume). Pre-create it with correct
# ownership so the non-root `node` user can write to it even before the
# volume is populated.
RUN mkdir -p /app/public/uploads && chown -R node:node /app/public/uploads

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{process.exit(r.status===200?0:1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
```

- [ ] **Step 3: Static review (no Docker available in this environment)**

Read back both files and confirm by inspection:
- Every `COPY --from=X` stage name (`deps`, `tools`, `builder`) matches a `FROM ... AS X` declared earlier in the same file.
- The `runner` stage's `COPY --from=builder .../node_modules/.prisma ./node_modules/.prisma` line is present — without it the app builds and boots but every Prisma query fails at runtime (Next's standalone tracer unreliably includes the native query-engine binary), which only surfaces as a health-check failure on the VPS, never locally, since there's no way to actually run this container here.
- The three `NEXT_PUBLIC_*` `ARG`/`ENV` pairs are present in the `builder` stage, matching the `build.args` added to `docker-compose.yml`'s `app` service in Task 7 — otherwise Meta Pixel and the Koko promo UI silently never activate (these are inlined into client bundles at build time, not read at runtime).
- No `ARG`/`ENV` in any stage contains a literal *secret* value (the `NEXT_PUBLIC_*` args are fine as plain args — they're public by definition, already shipped in client-side JS either way).
- `.dockerignore` excludes `.env` but not `.env.example` (needed for reference, harmless either way since it has no real secrets).

This cannot be validated by actually running `docker build` here — no Docker is installed in this dev environment (confirmed via `docker --version` returning "command not found"). The real build is validated on the VPS per DEPLOY_OVH.md (Task 12).

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "build: add multi-stage Dockerfile and .dockerignore"
```

---

### Task 7: `docker-compose.yml` — postgres, app, migrator

**Files:**
- Create: `docker-compose.yml`

**Interfaces:**
- Consumes: Dockerfile targets `tools` (migrator) and `runner` (app) from Task 6; env var names from `.env.example` (Task 5).
- Produces: Compose services `postgres`, `app`, `migrator`, network `dressingbear-network`, volumes `pgdata`/`uploads`. Consumed by Task 8 (adds `nginx`/`certbot` to this same file) and Task 9 (`scripts/deploy.sh`/`Makefile` reference `docker compose build migrator`, `docker compose --profile tools run --rm migrator ...`, `docker compose build app`, `docker compose up -d`).

- [ ] **Step 1: Create the file**

Create `docker-compose.yml`:

```yaml
name: dressingbear

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    # Loopback-only, not a public exposure: reachable solely from processes
    # running on this host (never the public internet or other machines).
    # Needed so `docker compose build app` (network: host, below) can reach
    # Postgres during `next build`'s ISR prerendering — see the Dockerfile's
    # `builder` stage comment for the full explanation.
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - app-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  app:
    build:
      context: .
      target: runner
      network: host
      secrets:
        - database_url
      # NEXT_PUBLIC_* vars are inlined at build time, not read at runtime —
      # `env_file` below only affects the running container, so these three
      # must additionally be passed as build args (public values, safe as
      # plain args). Compose resolves ${...} here from .env because
      # scripts/deploy.sh `source`s .env into the real shell environment
      # before calling `docker compose build` (Task 9) — verify on first
      # deploy that the build log shows no empty-value fallback.
      args:
        NEXT_PUBLIC_META_PIXEL_ID: ${NEXT_PUBLIC_META_PIXEL_ID}
        NEXT_PUBLIC_KOKO_ENABLED: ${NEXT_PUBLIC_KOKO_ENABLED}
        NEXT_PUBLIC_DEBUG_CART: ${NEXT_PUBLIC_DEBUG_CART}
    restart: unless-stopped
    env_file:
      - .env
    environment:
      NODE_ENV: production
    volumes:
      - uploads:/app/public/uploads
    networks:
      - app-network
    depends_on:
      postgres:
        condition: service_healthy
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  # One-off tooling image (migrations, seed, admin bootstrap). Never started
  # by `docker compose up`; only reachable via `docker compose --profile
  # tools run --rm migrator <command>`.
  migrator:
    build:
      context: .
      target: tools
    profiles: ["tools"]
    env_file:
      - .env
    environment:
      NODE_ENV: production
    volumes:
      - uploads:/app/public/uploads
    networks:
      - app-network
    depends_on:
      postgres:
        condition: service_healthy
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

networks:
  app-network:
    name: dressingbear-network
    driver: bridge

volumes:
  pgdata:
  uploads:

secrets:
  database_url:
    environment: DATABASE_URL
```

- [ ] **Step 2: Static review**

Read the file back and confirm:
- Every `${VAR}` reference (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_KOKO_ENABLED`, `NEXT_PUBLIC_DEBUG_CART`) has a matching entry in `.env.example` (Task 5).
- `secrets.database_url.environment: DATABASE_URL` requires Docker Compose ≥ 2.23 (documented as a preflight check in DEPLOY_OVH.md, Task 12) — this environment-sourced secret syntax is newer than file-based secrets. `scripts/deploy.sh` (Task 9) `source`s `.env` into the real shell environment before invoking any `docker compose build`, so both this secret source and the `NEXT_PUBLIC_*` build args resolve from actual process environment variables, not only Compose's own `.env`-file substitution — verify this isn't empty on the first real build (Task 6, Step 3).
- `app`'s `build.args` block matches the three `ARG`/`ENV` pairs added to the Dockerfile's `builder` stage in Task 6.
- No service other than `postgres` publishes a port yet (nginx, added in Task 8, will be the only one reaching the public interface).

This cannot be validated with `docker compose config` here — no Docker installed. Validated on the VPS.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "build: add docker-compose.yml with postgres, app, and migrator services"
```

---

### Task 8: Nginx reverse proxy + Let's Encrypt support

**Files:**
- Create: `nginx/nginx.conf`
- Create: `nginx/conf.d/app.conf`
- Modify: `docker-compose.yml` (add `nginx` and `certbot` services + their volumes)

**Interfaces:**
- Consumes: `app` service (Task 7) as proxy target (`app:3000`).
- Produces: HTTP (port 80) reverse proxy to the app, ACME HTTP-01 challenge path for cert issuance/renewal. The HTTPS server block is added later, post-cert-issuance, per DEPLOY_OVH.md (Task 12) — see the design spec §5.4 for why (nginx cannot start with a `listen 443 ssl` block referencing a certificate file that doesn't exist yet on first boot).

- [ ] **Step 1: Create the top-level Nginx config**

Create `nginx/nginx.conf`:

```nginx
user  nginx;
worker_processes  auto;

error_log  /var/log/nginx/error.log notice;
pid        /var/run/nginx.pid;

events {
    worker_connections  1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                       '$status $body_bytes_sent "$http_referer" '
                       '"$http_user_agent" "$http_x_forwarded_for"';

    access_log  /var/log/nginx/access.log  main;

    sendfile        on;
    tcp_nopush      on;
    keepalive_timeout  65;

    gzip  on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    client_max_body_size 10m;

    include /etc/nginx/conf.d/*.conf;
}
```

- [ ] **Step 2: Create the bootstrap (HTTP-only) server block**

Create `nginx/conf.d/app.conf`:

```nginx
# nginx/conf.d/app.conf
#
# Reverse proxy for the Dressing Bear Next.js app.
#
# >>> REAL DOMAIN: dressingbear.com / www.dressingbear.com <<<
# If the domain ever changes, update `server_name` here. This is the
# HTTP-only bootstrap config — DEPLOY_OVH.md's "Enable HTTPS" step replaces
# this file's contents with the HTTPS-enabled version once a Let's Encrypt
# certificate has been issued (nginx cannot start with a `listen 443 ssl`
# block pointing at a certificate file that doesn't exist yet).

upstream dressingbear_app {
    server app:3000;
}

server {
    listen 80;
    listen [::]:80;
    server_name dressingbear.com www.dressingbear.com;

    # Let's Encrypt HTTP-01 challenge path (see DEPLOY_OVH.md "SSL" section).
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://dressingbear_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;

        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options SAMEORIGIN always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
    }
}
```

(`X-Forwarded-Proto $scheme` matters even in this HTTP-only bootstrap config — once HTTPS is enabled and this header carries `https`, NextAuth's `trustHost: true` depends on it to build correct callback/redirect URLs, avoiding wrong-scheme redirect loops.)

- [ ] **Step 3: Add `nginx` and `certbot` services to `docker-compose.yml`**

Edit `docker-compose.yml` — insert after the `migrator` service (before the `networks:` block):

```yaml
  nginx:
    image: nginx:1.27-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - certbot-etc:/etc/letsencrypt:ro
      - certbot-www:/var/www/certbot:ro
    networks:
      - app-network
    depends_on:
      app:
        condition: service_healthy
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  # One-off certificate issuance/renewal. Not started by `docker compose up`.
  certbot:
    image: certbot/certbot:latest
    profiles: ["tools"]
    volumes:
      - certbot-etc:/etc/letsencrypt
      - certbot-www:/var/www/certbot
    entrypoint: ["certbot"]
```

Then update the `volumes:` block to add the two certbot volumes:

```yaml
volumes:
  pgdata:
  uploads:
  certbot-etc:
  certbot-www:
```

- [ ] **Step 4: Static review**

Confirm:
- `nginx`'s `depends_on: app: condition: service_healthy` relies on the app container's Dockerfile `HEALTHCHECK` (Task 6) — no separate Compose-level `healthcheck:` needed for `app` since Compose reads the container's health status regardless of how it was declared.
- `certbot`'s webroot path (`/var/www/certbot`) matches the `location /.well-known/acme-challenge/` root in `nginx/conf.d/app.conf`.
- No service besides `nginx` has a `ports:` entry reaching a non-loopback address (postgres is `127.0.0.1`-only, per Task 7).

Not runnable here (no Docker); validated on the VPS.

- [ ] **Step 5: Commit**

```bash
git add nginx/ docker-compose.yml
git commit -m "build: add Nginx reverse proxy and certbot service"
```

---

### Task 9: Deployment tooling — Makefile + `scripts/deploy.sh`

**Files:**
- Create: `Makefile`
- Create: `scripts/deploy.sh`

**Interfaces:**
- Consumes: `docker-compose.yml` services `postgres`, `migrator`, `app` (Task 7/8); `.env` (real file, from `.env.example` in Task 5).

- [ ] **Step 1: Create the deploy script**

Create `scripts/deploy.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# scripts/deploy.sh — pulls latest main, applies migrations, rebuilds the
# app image, and restarts the stack. Run from the repo root on the VPS for
# every deploy AFTER the initial one-time cutover (see DEPLOY_OVH.md for
# that first-time procedure — restoring the database dump and migrating
# existing images off Vercel Blob only happen once, not on every deploy).
#
# Usage: ./scripts/deploy.sh

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill in real values first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

echo "==> Pulling latest main"
git pull origin main

echo "==> Starting Postgres (if not already running)"
docker compose up -d postgres

echo "==> Waiting for Postgres to be healthy"
until docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
  sleep 2
done

echo "==> Building the migrator image"
docker compose build migrator

echo "==> Running database migrations"
docker compose --profile tools run --rm migrator npx prisma migrate deploy

echo "==> Building the app image (queries Postgres at build time for ISR prerendering)"
docker compose build app

echo "==> Starting the full stack"
docker compose up -d

echo "==> Pruning dangling images"
docker image prune -f

echo "==> Deploy complete. Recent app logs:"
docker compose logs --tail=30 app
```

Run: `chmod +x scripts/deploy.sh`

- [ ] **Step 2: Create the Makefile**

Create `Makefile`:

```makefile
.PHONY: help build up down stop restart logs ps migrate seed admin-ensure migrate-images deploy backup restore

help:
	@echo "Available targets:"
	@echo "  make build          - build Docker images"
	@echo "  make up             - start the stack (detached)"
	@echo "  make down           - stop and remove containers (volumes preserved)"
	@echo "  make stop           - stop containers without removing them"
	@echo "  make restart        - restart all services"
	@echo "  make logs           - follow logs for all services"
	@echo "  make ps             - show running services"
	@echo "  make migrate        - run database migrations"
	@echo "  make seed           - seed the database"
	@echo "  make admin-ensure   - ensure the default admin user exists"
	@echo "  make migrate-images - one-time: migrate existing images off Vercel Blob"
	@echo "  make deploy         - git pull, migrate, rebuild, restart (scripts/deploy.sh)"
	@echo "  make backup         - back up the database (scripts/backup-db.sh)"
	@echo "  make restore FILE=path/to/backup.bak - restore the database"

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

stop:
	docker compose stop

restart:
	docker compose restart

logs:
	docker compose logs -f

ps:
	docker compose ps

migrate:
	docker compose --profile tools run --rm migrator npx prisma migrate deploy

seed:
	docker compose --profile tools run --rm migrator npm run db:seed

admin-ensure:
	docker compose --profile tools run --rm migrator npm run admin:ensure

migrate-images:
	docker compose --profile tools run --rm migrator npm run migrate:images

deploy:
	./scripts/deploy.sh

backup:
	./scripts/backup-db.sh

restore:
	./scripts/restore-db.sh $(FILE)
```

- [ ] **Step 3: Static review**

Confirm every `docker compose` invocation in both files references a service actually defined in `docker-compose.yml` (`postgres`, `migrator`, `app`) and every `npm run`/`npx` command matches a script that exists in `package.json` after Tasks 1–4 (`db:deploy`/`prisma migrate deploy`, `db:seed`, `admin:ensure`, `migrate:images`). Not runnable here (no Docker).

- [ ] **Step 4: Commit**

```bash
git add Makefile scripts/deploy.sh
git commit -m "build: add Makefile and deploy script"
```

---

### Task 10: Database backup and restore scripts

**Files:**
- Create: `scripts/backup-db.sh`
- Create: `scripts/restore-db.sh`

**Interfaces:**
- Consumes: `docker-compose.yml`'s `postgres` service; `.env`'s `POSTGRES_USER`/`POSTGRES_DB`.

- [ ] **Step 1: Create the backup script**

Create `scripts/backup-db.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# scripts/backup-db.sh — dumps the postgres service to a timestamped file
# outside the pgdata volume. Keeps the most recent N backups (default 7).
# Credentials are read from .env, never passed as CLI args, to avoid
# landing in shell history.
#
# Usage: ./scripts/backup-db.sh [backup-dir] [keep-count]

cd "$(dirname "$0")/.."

BACKUP_DIR="${1:-/var/backups/dressingbear}"
KEEP="${2:-7}"

if [ ! -f .env ]; then
  echo "ERROR: .env not found." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/dressingbear-${TIMESTAMP}.bak"

echo "==> Dumping ${POSTGRES_DB} to ${OUT_FILE}"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$OUT_FILE"

echo "==> Backup written: ${OUT_FILE} ($(du -h "$OUT_FILE" | cut -f1))"

echo "==> Pruning old backups (keeping ${KEEP} most recent)"
# shellcheck disable=SC2012
ls -1t "$BACKUP_DIR"/dressingbear-*.bak 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  echo "    removing $old"
  rm -f "$old"
done

echo "==> Done. Remember: an additional off-server copy (e.g. synced to OVH"
echo "    Object Storage or downloaded periodically) is recommended — this"
echo "    script alone does not protect against loss of the VPS itself."
```

Run: `chmod +x scripts/backup-db.sh`

- [ ] **Step 2: Create the restore script**

Create `scripts/restore-db.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# scripts/restore-db.sh — restores a pg_dump custom-format backup into the
# running postgres service. DESTRUCTIVE: overwrites the current database.
#
# Usage: ./scripts/restore-db.sh <path-to-backup.bak>

cd "$(dirname "$0")/.."

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: pass an existing backup file. Usage: ./scripts/restore-db.sh <path-to-backup.bak>" >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "ERROR: .env not found." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

echo "WARNING: this will overwrite the '${POSTGRES_DB}' database with the contents of ${BACKUP_FILE}."
read -r -p "Type the database name (${POSTGRES_DB}) to confirm: " CONFIRM
if [ "$CONFIRM" != "$POSTGRES_DB" ]; then
  echo "Confirmation did not match. Aborted." >&2
  exit 1
fi

echo "==> Restoring ${BACKUP_FILE} into ${POSTGRES_DB}"
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl < "$BACKUP_FILE"

echo "==> Restore complete."
```

Run: `chmod +x scripts/restore-db.sh`

- [ ] **Step 3: Static review**

Confirm both scripts use `set -euo pipefail`, read credentials only from `.env` (never accept them as positional args), and neither script contains `docker compose down -v` or any other volume-deleting command. Not runnable here (no Docker, no Postgres).

- [ ] **Step 4: Commit**

```bash
git add scripts/backup-db.sh scripts/restore-db.sh
git commit -m "build: add database backup and restore scripts"
```

---

### Task 11: Remove Vercel-specific files

**Files:**
- Delete: `vercel.json`
- Delete: `.github/workflows/migrate.yml`

**Interfaces:** none (pure removal).

- [ ] **Step 1: Remove `vercel.json`**

Run: `git rm vercel.json`

(Its only content — the `buildCommand` running `prisma generate && ... && prisma migrate deploy && next build` — is superseded by the Docker build (Task 6) plus the explicit `docker compose --profile tools run --rm migrator npx prisma migrate deploy` step in `scripts/deploy.sh`/`Makefile` (Task 9).)

- [ ] **Step 2: Remove the migrate-on-GitHub-Actions workflow**

Run: `git rm .github/workflows/migrate.yml`

(This workflow required a `DATABASE_URL` reachable from GitHub's runners over the public internet. Once Postgres is bound to `127.0.0.1` only on the VPS — Task 7 — GitHub's runners can no longer reach it. Migrations now run on the VPS itself, via `scripts/deploy.sh`/`make migrate`.)

- [ ] **Step 3: Verify nothing else references these files**

Run: `grep -rn "vercel.json\|migrate.yml" --include="*.md" --include="*.ts" --include="*.tsx" --include="*.json" . 2>/dev/null | grep -v node_modules | grep -v ".worktrees"`
Expected: no remaining references outside this plan/spec's own text and the README section rewritten in Task 12 (check after Task 12 too).

- [ ] **Step 4: Commit**

```bash
git add -A vercel.json .github/workflows/migrate.yml
git commit -m "chore: remove Vercel-specific build config and GitHub Actions migration workflow"
```

---

### Task 12: Documentation — README.md, DEPLOY_OVH.md, STUB_READINESS_STATUS.md

**Files:**
- Modify: `README.md`
- Create: `DEPLOY_OVH.md`
- Modify: `STUB_READINESS_STATUS.md`

**Interfaces:** none (documentation only); references every artifact from Tasks 1–11.

- [ ] **Step 1: Update README's "Default Admin" section**

Edit `README.md` — replace the `#### Auto-creation on Vercel deploy` subsection:

Old:
```markdown
#### Auto-creation on Vercel deploy

`vercel.json`'s `buildCommand` includes `tsx scripts/ensure-admin.ts`, which runs on every deploy after `prisma migrate deploy`. The script:

- creates the default admin if missing → logs `Sample admin created`
- skips if it already exists → logs `Admin already exists`
- warns (without auto-promoting) if the email is registered as a regular customer
- soft-fails on any error so the build continues — the admin can still be created manually with `npm run admin:create`

It uses bcrypt for password hashing (cost 10) and is fully idempotent — safe to run on every deploy.

To override the defaults per environment (recommended for production), set these in **Vercel → Settings → Environment Variables**:
```

New:
```markdown
#### Auto-creation on deploy

`scripts/deploy.sh` (and `make admin-ensure`) run `tsx scripts/ensure-admin.ts` via the `migrator` Docker Compose service. The script:

- creates the default admin if missing → logs `Sample admin created`
- skips if it already exists → logs `Admin already exists`
- warns (without auto-promoting) if the email is registered as a regular customer
- soft-fails on any error — the admin can still be created manually with `npm run admin:create`

It uses bcrypt for password hashing (cost 10) and is fully idempotent — safe to run on every deploy.

To override the defaults per environment (recommended for production), set these in `.env` on the VPS:
```

- [ ] **Step 2: Update README's "Deployment & Migrations" section**

Edit `README.md` — replace the whole `## Deployment & Migrations` section (from `The Vercel build command is intentionally minimal:` through the end of the "Required GitHub secret" subsection) with:

```markdown
## Deployment & Migrations

Production runs on a self-hosted Docker Compose stack (app + PostgreSQL +
Nginx) on an OVHcloud VPS — see **[DEPLOY_OVH.md](./DEPLOY_OVH.md)** for the
full setup and deployment procedure.

- **Migrations** run via `docker compose --profile tools run --rm migrator
  npx prisma migrate deploy` (or `make migrate`), as an explicit step in
  `scripts/deploy.sh` before the app image is rebuilt — never automatically
  as part of the app's own build or startup.
- **Seeding** is deliberate: `make seed` (or `npm run db:seed` locally
  against a dev database).
- **Admin user** is ensured via `make admin-ensure`, or manually with
  `npm run admin:create`.
```

- [ ] **Step 3: Update the SMS section's Vercel reference**

Edit `README.md` — in the `## SMS / Notify.lk Integration` section, replace:

```markdown
- In production, set all three vars in **Vercel → Project → Settings →
  Environment Variables** (do not commit real values to any file).
```

with:

```markdown
- In production, set all three vars in `.env` on the VPS (do not commit
  real values to any file).
```

- [ ] **Step 4: Add a hosting line to the Tech Stack section**

Edit `README.md` — in `## Tech Stack`, after `- **Delivery:** RoyalExpress API`, add:

```markdown
- **Hosting:** Docker Compose (app + PostgreSQL + Nginx) on an OVHcloud VPS — see [DEPLOY_OVH.md](./DEPLOY_OVH.md)
```

- [ ] **Step 5: Create `DEPLOY_OVH.md`**

Create `DEPLOY_OVH.md`:

```markdown
# Deploying Dressing Bear to an OVHcloud VPS

Target: OVHcloud VPS-1, Ubuntu 24.04 LTS, 2 vCores, 4GB RAM, 40GB NVMe.
Stack: Docker Compose (PostgreSQL + Next.js app + Nginx), Let's Encrypt TLS.
Domain used throughout this doc: **dressingbear.com** — replace if it ever changes.

This is a one-time server setup + a one-time production cutover (migrating
the live database and images off Vercel), followed by a repeatable deploy
procedure for every future update.

## 1. Initial server setup

### 1.1 Connect via SSH

OVH emails the initial root password on provisioning:

```bash
ssh root@<VPS_IP>
```

### 1.2 Create a non-root sudo user

```bash
adduser deploy
usermod -aG sudo deploy
```

### 1.3 Configure SSH key authentication

From your **local machine** (not the VPS):

```bash
ssh-copy-id deploy@<VPS_IP>
```

If `ssh-copy-id` isn't available, append your public key manually:

```bash
ssh root@<VPS_IP> "mkdir -p /home/deploy/.ssh && cat >> /home/deploy/.ssh/authorized_keys" < ~/.ssh/id_ed25519.pub
ssh root@<VPS_IP> "chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys"
```

Confirm key login works **before** disabling password auth:

```bash
ssh deploy@<VPS_IP>
```

### 1.4 Disable root login and password authentication

On the VPS, edit `/etc/ssh/sshd_config`:

```bash
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

### 1.5 Configure the UFW firewall (SSH, HTTP, HTTPS only)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

### 1.6 Install Docker Engine + Compose plugin

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
sudo systemctl enable docker
```

Log out and back in for the `docker` group membership to take effect, then confirm:

```bash
docker --version
docker compose version   # MUST be >= 2.23 — the `secrets: environment:` source in
                          # docker-compose.yml needs it. Upgrade docker-compose-plugin
                          # via apt if it reports an older version.
```

### 1.7 Clone the repository

```bash
sudo mkdir -p /opt/dressingbear
sudo chown deploy:deploy /opt/dressingbear
git clone git@github.com:shenalsanjana/ecom-app-v1.git /opt/dressingbear
cd /opt/dressingbear
```

(Add the VPS's SSH public key as a **read-only deploy key** on the GitHub repo — Settings → Deploy keys — or clone over HTTPS with a personal access token instead.)

### 1.8 Create the production `.env`

```bash
cp .env.example .env
nano .env    # fill in every real value — see the list below
chmod 600 .env
```

Required values (see `.env.example` for the full annotated list): `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL` (must match the three Postgres values, host `postgres`), `AUTH_SECRET` (generate with `openssl rand -base64 32`), `AUTH_URL`/`APP_URL` (`https://dressingbear.com`), SMTP credentials, `BRAND_EMAIL`, Notify.lk credentials, and whichever payment/courier credentials are actually in use (`PAYHERE_*` at minimum; `KOKO_*`/`MINTPAY_*`/`ROYAL_EXPRESS_*` only if those integrations are enabled).

## 2. One-time production cutover (live data migration)

**Do this once**, before the first `docker compose up -d`. This is the
highest-risk part of the migration — it touches the real production
database. The source database (Neon-backed Vercel Postgres) is never
written to; every step below is read-only against it.

### 2.1 Confirm PostgreSQL version parity

Before anything else, check the source database's major version — via the
Vercel/Neon dashboard's SQL console, or:

```bash
psql "<NEON_DIRECT_URL>" -c "SELECT version();"
```

`docker-compose.yml` pins `postgres:16-alpine`. If Neon reports a different
major version, edit that image tag in `docker-compose.yml` to match before
continuing (`pg_restore` across major versions can fail or silently lose
features).

### 2.2 Dump the source database

Get the **direct** (non-pooled) Neon connection string from the Vercel
dashboard — the same requirement the old `migrate deploy` step had. Run the
dump from a `postgres` client container so the client version always
matches the server, regardless of local tooling:

```bash
docker run --rm postgres:16 pg_dump "<NEON_DIRECT_URL>" \
  -Fc --no-owner --no-acl -f /tmp/dump.bak
docker cp "$(docker create --rm postgres:16)":/tmp/dump.bak ./dump.bak 2>/dev/null || true
```

(Simpler in practice: run the `pg_dump` above with a bind mount so the file
lands directly on the host: `docker run --rm -v "$(pwd)":/out postgres:16
pg_dump "<NEON_DIRECT_URL>" -Fc --no-owner --no-acl -f /out/dump.bak`.)

If you dumped on a different machine than the VPS, copy it over:

```bash
scp dump.bak deploy@<VPS_IP>:/opt/dressingbear/dump.bak
```

`--no-owner --no-acl` avoids restore failing on Neon-managed roles (e.g.
`neon_superuser`) that don't exist on the new self-hosted Postgres. Because
this is a full dump, it carries the `_prisma_migrations` table too — schema,
data, and migration history all arrive together.

### 2.3 Start Postgres and restore

```bash
cd /opt/dressingbear
docker compose up -d postgres
until docker compose exec -T postgres pg_isready -U "$(grep '^POSTGRES_USER=' .env | cut -d= -f2)"; do sleep 2; done

docker compose cp dump.bak postgres:/tmp/dump.bak
docker compose exec -T postgres pg_restore -U "$(grep '^POSTGRES_USER=' .env | cut -d= -f2)" \
  -d "$(grep '^POSTGRES_DB=' .env | cut -d= -f2)" --no-owner --no-acl /tmp/dump.bak
```

### 2.4 Confirm migration state

```bash
docker compose build migrator
docker compose --profile tools run --rm migrator npx prisma migrate status
```

Expected: "Database schema is up to date!" — the restored `_prisma_migrations`
table already reflects every applied migration, so no `migrate deploy` or
`migrate resolve` is needed here.

### 2.5 Migrate existing images off Vercel Blob

```bash
docker compose --profile tools run --rm migrator npm run migrate:images
```

This downloads every `Category.image` / `VariantImage.url` currently
pointing at `*.public.blob.vercel-storage.com` into the `uploads` Docker
volume and rewrites those DB rows to the new local `/uploads/...` URL. Safe
to re-run (already-local URLs are skipped). Do this **before** the next step
so the app's first build prerenders pages with the new local URLs.

`Category.image` and `VariantImage.url` are the only *typed* URL columns in
the schema, but product descriptions render through `react-markdown`
(`app/_components/product/description.tsx`), so a stray Blob URL could in
principle be hand-authored into free-text content (a markdown image link in
a description, for example) rather than one of the two structured columns
the script above handles. Do a quick sanity scan before moving on:

```bash
docker compose --profile tools run --rm migrator npx tsx -e '
import { prisma } from "@/app/_lib/prisma";
(async () => {
  const products = await prisma.product.findMany({ where: { description: { contains: "vercel-storage.com" } }, select: { id: true, name: true } });
  const reviews = await prisma.review.findMany({ where: { body: { contains: "vercel-storage.com" } }, select: { id: true, productId: true } });
  console.log("Products with a Blob URL in description:", products);
  console.log("Reviews with a Blob URL in body:", reviews);
  await prisma.$disconnect();
})();
'
```

If either list is non-empty, edit those rows manually (via `/admin`) to
point at the migrated local URL before going live — `next/image`'s
`remotePatterns` no longer allow-lists `*.public.blob.vercel-storage.com`
(Task 2), so any surviving reference to it will hard-fail to render.

### 2.6 Build and start the app

```bash
docker compose build app
docker compose up -d
docker compose ps
curl -f http://localhost/api/health
```

At this point the site is reachable over plain HTTP on the VPS's IP —
useful for verifying everything works before DNS/TLS are in place.

## 3. Go live

### 3.1 Point DNS at the VPS

Create an `A` record for `dressingbear.com` → `<VPS_IP>`, and either an `A`
record or a `CNAME` for `www.dressingbear.com` → the same target. Wait for
propagation:

```bash
dig +short dressingbear.com
```

### 3.2 Obtain the Let's Encrypt certificate

Nginx is already serving the ACME challenge path (bootstrap HTTP-only
config, `nginx/conf.d/app.conf`) from step 2.6, so the webroot method works
with zero downtime:

```bash
docker compose --profile tools run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d dressingbear.com -d www.dressingbear.com \
  --email <your-email> --agree-tos --no-eff-email
```

### 3.3 Enable HTTPS

Replace the contents of `nginx/conf.d/app.conf` with:

```nginx
upstream dressingbear_app {
    server app:3000;
}

server {
    listen 80;
    listen [::]:80;
    server_name dressingbear.com www.dressingbear.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name dressingbear.com www.dressingbear.com;

    ssl_certificate     /etc/letsencrypt/live/dressingbear.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dressingbear.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://dressingbear_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;

        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options SAMEORIGIN always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    }
}
```

Then reload:

```bash
docker compose restart nginx
curl -f https://dressingbear.com/api/health
```

Commit this change to the repo (`git add nginx/conf.d/app.conf && git commit
-m "chore: enable HTTPS after Let's Encrypt cert issuance"`) so future
deploys don't revert to the HTTP-only bootstrap config.

### 3.4 Certificate renewal

Let's Encrypt certs expire after 90 days. Add a cron entry for automatic
renewal:

```bash
sudo crontab -e
```

```cron
0 3 * * * cd /opt/dressingbear && docker compose --profile tools run --rm certbot renew --quiet && docker compose exec nginx nginx -s reload
```

## 4. Ongoing operations

### 4.1 Deploy an update

```bash
cd /opt/dressingbear
./scripts/deploy.sh
# or: make deploy
```

This pulls `main`, runs migrations, rebuilds the app image, and restarts
the stack — see `scripts/deploy.sh` for the exact sequence.

### 4.2 View logs

```bash
docker compose logs -f app
docker compose logs -f nginx
docker compose logs -f postgres
# or: make logs (all services)
```

### 4.3 Restart services

```bash
docker compose restart
# or a single service: docker compose restart app
```

### 4.4 Run migrations manually

```bash
make migrate
```

### 4.5 Back up the database

```bash
./scripts/backup-db.sh
# or with custom dir/retention: ./scripts/backup-db.sh /var/backups/dressingbear 14
```

Schedule daily backups via cron:

```bash
sudo crontab -e
```

```cron
0 2 * * * cd /opt/dressingbear && ./scripts/backup-db.sh >> /var/log/dressingbear-backup.log 2>&1
```

**Also keep an off-server copy** — sync `/var/backups/dressingbear` to OVH
Object Storage, another cloud provider, or download it periodically. Backups
that live only on the same VPS don't protect against loss of that VPS.

### 4.6 Restore the database

```bash
./scripts/restore-db.sh /var/backups/dressingbear/dressingbear-<timestamp>.bak
```

This is destructive (overwrites the live database) and requires typing the
database name to confirm.

### 4.7 Recovery after a VPS reboot

Docker's systemd service is enabled (step 1.6: `systemctl enable docker`),
and every service in `docker-compose.yml` has `restart: unless-stopped` —
containers that were running before the reboot come back automatically once
Docker starts, with no manual action needed.

## 5. What this migration deliberately does not automate

- The one-time database dump/restore (§2) and image migration (§2.5) are
  run manually, once, by design — they touch production data and warrant a
  human watching each step, not a script.
- Never run `docker compose down -v` — it deletes the `pgdata` volume. None
  of the scripts in this repo do this.
```

- [ ] **Step 6: Add a STUB_READINESS_STATUS.md tracker row**

Edit `STUB_READINESS_STATUS.md` — add a new row to the `## Status` table (after the `order-color-notifications` row):

```markdown
| vercel-to-ovh-docker-migration | Remove Vercel dependency and Dockerize the app for production deployment on an OVHcloud VPS (Docker Compose: app + PostgreSQL + Nginx, Let's Encrypt) | Done | subagent-driven-development | Not Started | N/A (no OpenSpec artifacts for this change — see note) | Not Started | N/A | N/A | Plan written | Create worktree `.worktrees/vercel-to-ovh-docker-migration` / branch `feat/vercel-to-ovh-docker-migration`, then apply this plan's 13 tasks task-by-task. | Live production data exists (Vercel Postgres/Neon-backed) — Task 12/DEPLOY_OVH.md documents a one-time, user-run dump/restore + Blob-image migration; not executed by the agent (no Vercel/Neon credentials available). This dev environment has no Docker installed and no local Postgres, so Docker/DB-related verification (image build, container boot, migrations, Nginx reachability) is deferred to the VPS — only `npm test`/`tsc --noEmit`/`npm run lint` and static file review are run locally. Spec: `docs/superpowers/specs/2026-07-16-vercel-to-ovh-docker-migration-design.md`. Plan: `docs/superpowers/plans/2026-07-16-vercel-to-ovh-docker-migration.md`. |
```

(This change follows the Superpowers brainstorm/plan lifecycle but not `/opsx:propose` — infrastructure/deployment changes of this shape don't fit the OpenSpec delta-spec model the same way a feature change does, since there's no `openspec/specs/<capability>/spec.md` this maps onto. Noted as `N/A` in that column rather than skipped silently.)

- [ ] **Step 7: Verify docs are internally consistent**

Run: `grep -rn "vercel.json\|Vercel Blob\|Vercel Postgres\|migrate.yml" README.md`
Expected: only the intentional, still-accurate historical reference in the "Deployment & Migrations" section's git history is gone — no dangling instructions telling someone to configure something in "Vercel → Settings".

- [ ] **Step 8: Commit**

```bash
git add README.md DEPLOY_OVH.md STUB_READINESS_STATUS.md
git commit -m "docs: add DEPLOY_OVH.md and update README for Docker/OVH deployment"
```

---

### Task 13: Final local validation

**Files:** none.

**Interfaces:** none — this task runs every check actually available in this dev environment and produces a clear list of what remains for the VPS.

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Unit tests**

Run: `npm test`
Expected: all tests pass, including the new `app/api/health` and `app/_lib/blob-migration` suites from Tasks 1 and 4.

- [ ] **Step 4: Confirm no stray Vercel references remain in source**

Run: `grep -rln "@vercel/blob\|vercel-storage.com" app lib components 2>/dev/null`
Expected: no output (all removed in Tasks 2 and 3).

- [ ] **Step 5: Confirm `.env` hygiene**

Run: `git status --porcelain | grep -E "^\?\? \.env$"` (should be empty/no match unless a real `.env` was created locally — if so, confirm it's untracked, not confirm it's absent)

Run: `git check-ignore -v .env 2>/dev/null || echo "no local .env present — fine, not required for this repo"`

- [ ] **Step 6: Record what's deferred to the VPS**

This is not a script — write down (in the final summary to the user) the explicit list of checks that require Docker/a real database and therefore could not run in this session:

- `docker compose build` for every service (Dockerfile syntax/build correctness)
- `docker compose up -d` (container boot, health checks passing, Nginx reaching the app)
- `docker compose --profile tools run --rm migrator npx prisma migrate deploy` against a real database
- Data persistence across container recreation (`docker compose down && docker compose up -d` without `-v`, confirming the `pgdata`/`uploads` volumes survive)
- The real Neon dump/restore and Vercel Blob image migration (DEPLOY_OVH.md §2)
- Let's Encrypt certificate issuance and HTTPS (DEPLOY_OVH.md §3)

All of these are specified precisely (exact commands) in `DEPLOY_OVH.md` and `docker-compose.yml`/`Dockerfile`, but execution requires the actual VPS.

- [ ] **Step 7: Commit (if any fixups were needed during validation)**

If Steps 1–4 required any fixes, commit them:

```bash
git add -A
git commit -m "fix: address issues found during final validation"
```

If nothing needed fixing, skip this step — nothing to commit.

---

## Self-Review Notes

**Spec coverage:** every numbered requirement in the design spec (§3 Vercel dependency removal, §5.1–5.6 Dockerfile/health/compose/Nginx/uploads/env, §6 file list, §7 migration procedure, §8 backups, §9 out-of-scope items) maps to a task above. The design spec's §5.1/§5.3/§7 were revised mid-planning (build-time DB access mechanism, Postgres port binding, corrected validation claims) — Tasks 6, 7, and 13 reflect the corrected versions, not the original committed text before those edits.

**Placeholder scan:** no TBD/TODO markers; every code block is complete, runnable content, not a description of what to write.

**Type consistency:** `isBlobUrl`/`localFilenameFor`/`BLOB_HOSTNAME_SUFFIX` (Task 4) are used with identical names and signatures in both the test file and the orchestration script. The `/api/health` route's response shape (`{ status: "ok" | "error" }`) is referenced identically in Task 1's test and in the Dockerfile/Compose healthcheck commands (Tasks 6/7) that call it.

**Two defects caught by a second review pass, fixed before handoff (neither was catchable by tsc/vitest/lint, since both are build/runtime-environment behaviors that only surface when the container actually runs — impossible to verify in this Docker-less dev environment):**
1. The `runner` stage originally omitted `node_modules/.prisma` — Next's standalone file tracer unreliably includes Prisma's native query-engine binary since it's resolved at runtime, not via static `require()`. Without the explicit `COPY` (now in Task 6), the app would boot but every DB query — including `/api/health` — would fail, and since `nginx` depends on `app` being healthy, the whole stack would never come up. This is exactly the kind of failure "verified on the VPS" was masking; it's now fixed at the source instead of deferred.
2. `NEXT_PUBLIC_META_PIXEL_ID`/`NEXT_PUBLIC_KOKO_ENABLED`/`NEXT_PUBLIC_DEBUG_CART` are inlined into client bundles at Next.js *build* time, not read at runtime — the original compose config only passed `DATABASE_URL` to the build, so these three would have silently baked in as empty regardless of what's set in the runtime `.env`. Fixed by adding them as `build.args` (Task 7) and `ARG`/`ENV` in the `builder` stage (Task 6) — safe as plain build args since they're public by definition.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-16-vercel-to-ovh-docker-migration.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
