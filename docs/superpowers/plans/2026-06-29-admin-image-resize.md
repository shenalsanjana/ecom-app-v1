# Admin Image Auto-Resize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-resize admin image uploads client-side — category images to 1200×1200 and product (main + gallery) images to 1200×1500 — cover-cropped and re-encoded to WebP.

**Architecture:** A new browser-only module `app/_lib/resize-image.ts` exposes a pure `computeCoverCrop` (center-crop geometry) and a canvas-based `resizeImageFile`. A `resizeTarget` preset is threaded from each upload call site through `ImageInput`/`UploadButton` into `resizeImageFile`, which runs before the existing upload path (Vercel Blob in prod, `/public/uploads` in dev). Existing stored images are untouched.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React client components, browser Canvas + `createImageBitmap`, Vitest.

## Global Constraints

- Category target dimensions: **1200×1200**; product target dimensions: **1200×1500** (exact values).
- Output encoding: **WebP, quality 0.85**; fallback **JPEG, quality 0.9** when WebP encode returns null.
- Cover / center-crop fit. Decode with `createImageBitmap(file, { imageOrientation: "from-image" })` so EXIF rotation is applied.
- Pass through **unchanged** (no resize) for `image/svg+xml`, `image/gif`, and any non-`image/*` file.
- **No backfill** — only new uploads are resized; existing DB image records are untouched.
- No local database is available; validate with `npm run test` (Vitest) and `npm run build` (tsc/Next build gate). Do not run `prisma migrate dev`.
- Do not change `delete-category-button.tsx` / `categories-table.tsx` — category delete already exists.

---

### Task 1: `computeCoverCrop` geometry (pure, TDD)

**Files:**
- Create: `app/_lib/resize-image.ts`
- Test: `app/_lib/__tests__/resize-image.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export type ResizeTarget = "category" | "product";` and
  `export function computeCoverCrop(srcW: number, srcH: number, targetW: number, targetH: number): { sx: number; sy: number; sw: number; sh: number }` — returns the centered source rectangle to draw for a cover crop.

- [ ] **Step 1: Write the failing tests**

```ts
// app/_lib/__tests__/resize-image.test.ts
import { describe, it, expect } from "vitest";
import { computeCoverCrop } from "../resize-image";

describe("computeCoverCrop", () => {
  it("crops width when the source is wider than the target ratio", () => {
    // 2000x1000 into 1200x1200 (target ratio 1): keep full height, crop sides
    expect(computeCoverCrop(2000, 1000, 1200, 1200)).toEqual({ sx: 500, sy: 0, sw: 1000, sh: 1000 });
  });

  it("crops height when the source is taller than the target ratio", () => {
    // 1000x2000 into 1200x1200: keep full width, crop top/bottom
    expect(computeCoverCrop(1000, 2000, 1200, 1200)).toEqual({ sx: 0, sy: 500, sw: 1000, sh: 1000 });
  });

  it("crops width for a square source into a 4:5 product box", () => {
    // 1200x1200 into 1200x1500 (target ratio 0.8): crop sides to 960 wide
    expect(computeCoverCrop(1200, 1200, 1200, 1500)).toEqual({ sx: 120, sy: 0, sw: 960, sh: 1200 });
  });

  it("returns the full rectangle when source ratio already matches target", () => {
    // 800x1000 is exactly 4:5 -> no crop
    expect(computeCoverCrop(800, 1000, 1200, 1500)).toEqual({ sx: 0, sy: 0, sw: 800, sh: 1000 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — cannot find module `../resize-image` / `computeCoverCrop is not a function`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// app/_lib/resize-image.ts
export type ResizeTarget = "category" | "product";

// Largest centered source rectangle whose aspect ratio equals the target
// (cover crop). Equal-ratio inputs fall into the else branch and return the
// full source rectangle.
export function computeCoverCrop(
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const srcRatio = srcW / srcH;
  const targetRatio = targetW / targetH;
  if (srcRatio > targetRatio) {
    const sw = srcH * targetRatio;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  const sh = srcW / targetRatio;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: PASS — all 4 `computeCoverCrop` tests green.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/resize-image.ts app/_lib/__tests__/resize-image.test.ts
git commit -m "feat(admin): add computeCoverCrop center-crop geometry"
```

---

### Task 2: `resizeImageFile` canvas encoder (pass-through TDD + manual encode)

**Files:**
- Modify: `app/_lib/resize-image.ts`
- Test: `app/_lib/__tests__/resize-image.test.ts`

**Interfaces:**
- Consumes: `computeCoverCrop`, `ResizeTarget` from Task 1.
- Produces: `export async function resizeImageFile(file: File, target: ResizeTarget): Promise<File>` — returns a new WebP (or JPEG-fallback) `File` for raster images, or the original `File` unchanged for SVG/GIF/non-image input.

> Note: `createImageBitmap`/`canvas.toBlob` are not implemented in jsdom, so only the **pass-through** branch (which returns before touching the canvas) is unit-tested. The encode path is verified manually in Task 3's validation.

- [ ] **Step 1: Write the failing pass-through tests**

Append to `app/_lib/__tests__/resize-image.test.ts`:

```ts
import { resizeImageFile } from "../resize-image";

describe("resizeImageFile pass-through", () => {
  it("returns SVG files unchanged", async () => {
    const file = new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" });
    expect(await resizeImageFile(file, "category")).toBe(file);
  });

  it("returns GIF files unchanged", async () => {
    const file = new File([new Uint8Array([0x47, 0x49, 0x46])], "anim.gif", { type: "image/gif" });
    expect(await resizeImageFile(file, "product")).toBe(file);
  });

  it("returns non-image files unchanged", async () => {
    const file = new File(["%PDF"], "spec.pdf", { type: "application/pdf" });
    expect(await resizeImageFile(file, "product")).toBe(file);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — `resizeImageFile is not a function` (export does not exist yet).

- [ ] **Step 3: Write the implementation**

Append to `app/_lib/resize-image.ts`:

```ts
const TARGET_DIMS: Record<ResizeTarget, { w: number; h: number }> = {
  category: { w: 1200, h: 1200 },
  product: { w: 1200, h: 1500 },
};

// Vector / animated formats can't be canvas-cropped cleanly — leave them as-is.
const PASS_THROUGH_TYPES = new Set(["image/svg+xml", "image/gif"]);

function encodeCanvas(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (webp) => {
        if (webp) {
          resolve(webp);
          return;
        }
        // Older Safari can't encode WebP — fall back to JPEG.
        canvas.toBlob((jpeg) => resolve(jpeg), "image/jpeg", 0.9);
      },
      "image/webp",
      0.85,
    );
  });
}

// Cover-crop + downscale a raster image to the target box and re-encode to WebP.
// Returns a new File; the original is returned untouched for pass-through types.
export async function resizeImageFile(file: File, target: ResizeTarget): Promise<File> {
  if (!file.type.startsWith("image/") || PASS_THROUGH_TYPES.has(file.type)) {
    return file;
  }

  const { w: tw, h: th } = TARGET_DIMS[target];
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { sx, sy, sw, sh } = computeCoverCrop(bitmap.width, bitmap.height, tw, th);

  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, tw, th);
  bitmap.close();

  const blob = await encodeCanvas(canvas);
  if (!blob) return file;

  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const base = file.name.replace(/\.[^./\\]+$/, "");
  return new File([blob], `${base}.${ext}`, { type: blob.type });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: PASS — the 3 pass-through tests plus the 4 from Task 1.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/resize-image.ts app/_lib/__tests__/resize-image.test.ts
git commit -m "feat(admin): add resizeImageFile canvas WebP encoder"
```

---

### Task 3: Thread `resizeTarget` through upload UI and wire call sites

**Files:**
- Modify: `app/_components/admin/products/upload-button.tsx`
- Modify: `app/_components/admin/products/image-input.tsx`
- Modify: `app/_components/admin/categories/category-form.tsx:49`
- Modify: `app/_components/admin/products/category-select.tsx:38`
- Modify: `app/_components/admin/products/product-form.tsx:117`
- Modify: `app/_components/admin/products/gallery-editor.tsx:24`

**Interfaces:**
- Consumes: `resizeImageFile`, `ResizeTarget` from Task 2.
- Produces: `UploadButton` and `ImageInput` both accept an optional `resizeTarget?: ResizeTarget` prop. When set, picked files are run through `resizeImageFile(file, resizeTarget)` before upload; when omitted, behavior is unchanged.

> No unit test — this is UI wiring with no jsdom-runnable canvas path. The deliverable is gated by `npm run build` (TypeScript) plus the manual upload check in Step 6.

- [ ] **Step 1: Add the `resizeTarget` prop to `UploadButton` and apply it in `handleFiles`**

In `app/_components/admin/products/upload-button.tsx`, add the import near the top (after the existing `upload` import):

```ts
import { resizeImageFile, type ResizeTarget } from "@/app/_lib/resize-image";
```

Add `resizeTarget` to the prop list and its type:

```tsx
export function UploadButton({
  onUploaded,
  onUploadedMany,
  multiple = false,
  resizeTarget,
  label = "Upload",
  className = "rounded border px-2 py-1.5 text-sm whitespace-nowrap disabled:opacity-50",
}: {
  onUploaded?: (url: string) => void;
  onUploadedMany?: (urls: string[]) => void;
  multiple?: boolean;
  resizeTarget?: ResizeTarget;
  label?: string;
  className?: string;
}) {
```

Replace the existing upload line inside `handleFiles`:

```tsx
      // allSettled so one bad file doesn't discard the others; order preserved.
      const results = await Promise.allSettled(files.map(uploadOne));
```

with a resize-then-upload step:

```tsx
      // Resize/crop each file (when a target is set) before uploading.
      // allSettled so one bad file doesn't discard the others; order preserved.
      const results = await Promise.allSettled(
        files.map(async (file) => {
          const prepared = resizeTarget ? await resizeImageFile(file, resizeTarget) : file;
          return uploadOne(prepared);
        }),
      );
```

- [ ] **Step 2: Add the `resizeTarget` prop to `ImageInput`, forward it, and shape the preview**

Replace the body of `app/_components/admin/products/image-input.tsx` with:

```tsx
"use client";
import { UploadButton } from "./upload-button";
import type { ResizeTarget } from "@/app/_lib/resize-image";

// A URL/path text field paired with an "Upload" button. Both write to the same
// value, so existing /products/… paths keep working and a local-device upload
// just fills the field with a Blob URL. Used for the category image and the
// product main image. When `resizeTarget` is set, uploads are cropped/resized
// to that target and the preview box mirrors the resulting aspect ratio.
export function ImageInput({
  value,
  onChange,
  preview = false,
  resizeTarget,
  placeholder = "Image URL / path — or upload →",
}: {
  value: string;
  onChange: (v: string) => void;
  preview?: boolean;
  resizeTarget?: ResizeTarget;
  placeholder?: string;
}) {
  const previewBox =
    resizeTarget === "product"
      ? "aspect-[4/5] w-40"
      : resizeTarget === "category"
        ? "aspect-square w-40"
        : "h-32 w-full";
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm"
        />
        <UploadButton onUploaded={onChange} resizeTarget={resizeTarget} />
      </div>
      {preview && value ? (
        <div className={`overflow-hidden rounded ${previewBox}`}>
          {/* Plain <img>: this admin-only thumbnail must render any pasted URL
              (external host, /public path, or Blob URL) without next/image's
              remotePatterns allowlist throwing and breaking the form. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Wire the category call sites to `"category"`**

In `app/_components/admin/categories/category-form.tsx:49`, change:

```tsx
          <ImageInput value={image} onChange={setImage} preview />
```

to:

```tsx
          <ImageInput value={image} onChange={setImage} preview resizeTarget="category" />
```

In `app/_components/admin/products/category-select.tsx:38`, change:

```tsx
          <ImageInput value={image} onChange={setImage} preview placeholder="Image URL / path — or upload →" />
```

to:

```tsx
          <ImageInput value={image} onChange={setImage} preview resizeTarget="category" placeholder="Image URL / path — or upload →" />
```

- [ ] **Step 4: Wire the product call sites to `"product"`**

In `app/_components/admin/products/product-form.tsx:117`, change:

```tsx
            <ImageInput value={f.image} onChange={(v) => set("image", v)} preview />
```

to:

```tsx
            <ImageInput value={f.image} onChange={(v) => set("image", v)} preview resizeTarget="product" />
```

In `app/_components/admin/products/gallery-editor.tsx:24`, change:

```tsx
      <UploadButton multiple label="⤴ Upload from device" onUploadedMany={(newUrls) => onChange([...urls, ...newUrls])} className="rounded border px-3 py-1 text-sm disabled:opacity-50" />
```

to:

```tsx
      <UploadButton multiple resizeTarget="product" label="⤴ Upload from device" onUploadedMany={(newUrls) => onChange([...urls, ...newUrls])} className="rounded border px-3 py-1 text-sm disabled:opacity-50" />
```

- [ ] **Step 5: Run the build and tests**

Run: `npm run build`
Expected: PASS — no TypeScript errors; the new prop type-checks at all four call sites.

Run: `npm run test`
Expected: PASS — existing suite plus Tasks 1–2 still green.

- [ ] **Step 6: Manual upload verification**

Start the dev server (`npm run dev`), then in the admin UI:
1. Edit a product → upload a **wide** JPEG as the main image. Confirm the stored URL ends in `.webp` and the saved file is 1200×1500, center-cropped.
2. Upload a **portrait phone photo** (with EXIF rotation) → confirm it is upright (not sideways) and 1200×1500.
3. Edit a category → upload any image → confirm 1200×1200 `.webp`.
4. Upload an **SVG** → confirm it is stored unchanged (still `.svg`).

Expected: dimensions, format, orientation, and pass-through all as described.

- [ ] **Step 7: Commit**

```bash
git add app/_components/admin/products/upload-button.tsx app/_components/admin/products/image-input.tsx app/_components/admin/categories/category-form.tsx app/_components/admin/products/category-select.tsx app/_components/admin/products/product-form.tsx app/_components/admin/products/gallery-editor.tsx
git commit -m "feat(admin): auto-resize category/product uploads to fixed sizes"
```

---

### Task 4: Fix product OpenGraph image dimensions

**Files:**
- Modify: `app/products/[id]/page.tsx:49`

**Interfaces:**
- Consumes: nothing (independent metadata fix).
- Produces: nothing consumed downstream.

> The OG image is the product main image, which now becomes 1200×1500. The declared OG dimensions must match. No unit test — gated by `npm run build`.

- [ ] **Step 1: Update the declared dimensions**

In `app/products/[id]/page.tsx:49`, change:

```tsx
      images: [{ url: imageUrl, width: 1200, height: 1200, alt: detail.product.name }],
```

to:

```tsx
      images: [{ url: imageUrl, width: 1200, height: 1500, alt: detail.product.name }],
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: PASS — no errors.

- [ ] **Step 3: Commit**

```bash
git add app/products/[id]/page.tsx
git commit -m "fix(seo): match product OG image dimensions to 1200x1500"
```

---

## Self-Review

**Spec coverage:**
- Category 1200×1200 / product 1200×1500 targets → Task 2 `TARGET_DIMS`, wired in Task 3. ✓
- Auto cover-crop → Task 1 `computeCoverCrop`. ✓
- WebP @ 0.85 + JPEG fallback → Task 2 `encodeCanvas`. ✓
- Client-side, both upload paths → Task 3 wires before `uploadOne` (which already branches prod/dev). ✓
- EXIF orientation → Task 2 `imageOrientation: "from-image"`. ✓
- SVG/GIF/non-image pass-through → Task 2 guard + tests. ✓
- Correct `File.type` for Blob content-type → Task 2 `new File(..., { type: blob.type })`. ✓
- Preview reflects crop aspect → Task 3 Step 2. ✓
- OG dimension ripple → Task 4. ✓
- No backfill / delete button untouched → Global Constraints; no task modifies stored data or the delete components. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full code. ✓

**Type consistency:** `ResizeTarget`, `computeCoverCrop`, `resizeImageFile`, and the `resizeTarget` prop name are used identically across Tasks 1–3. ✓
