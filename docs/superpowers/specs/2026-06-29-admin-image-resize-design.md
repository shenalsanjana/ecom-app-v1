# Design — Admin image auto-resize (category 1200×1200, product 1200×1500)

**Date:** 2026-06-29
**Status:** Approved (brainstorm)
**Author:** brainstorming session

## Problem

Admin image uploads (category image, product main image, product gallery) are
stored **as-is** — no dimension normalization. The storefront renders categories
as squares and products at `aspect-[4/5]`, so off-ratio uploads get cropped
inconsistently by the browser and ship oversized files. We want every uploaded
image normalized to a fixed size on the way in:

- **Category images → 1200×1200** (1:1)
- **Product main + gallery images → 1200×1500** (4:5)

A category **delete** capability was also requested; it already exists (see
§Non-goals).

## Decisions (confirmed with user)

- **Auto-resize/crop** uploads (not validate-and-reject, not guidance-only).
- **Cover / center-crop** fit: scale to fill the target box, crop the overflow
  symmetrically from the edges.
- **Re-encode to WebP @ quality 0.85.**
- **Client-side** processing via `<canvas>`. Production uploads go straight from
  the browser to Vercel Blob (`/api/blob/upload`), bypassing the server, so a
  server-side `sharp` step would not see them. Client-side covers both the prod
  (Vercel Blob) and dev (`/public/uploads`) paths uniformly with no new deps.
- **SVG and GIF pass through un-resized** (vector / animation can't be
  canvas-cropped cleanly); any non-image file also passes through.

## Non-goals / scope boundaries

- **Existing images are not touched.** Resize applies only to *new* uploads.
  Every category/product image already in the database keeps its current
  dimensions. No backfill.
- **Delete button is already implemented** in
  `app/_components/admin/categories/categories-table.tsx` via
  `delete-category-button.tsx` — it appears when a category has 0 products
  (otherwise an "In use" label), guarded by a `confirm()` dialog. No change.
- No cropping UI / manual crop box. Center-crop is automatic.

## Architecture

### New module: `app/_lib/resize-image.ts`

Split into a pure geometry function (unit-testable without a DOM) and a
DOM/canvas function.

```ts
export type ResizeTarget = "category" | "product";

const TARGET_DIMS: Record<ResizeTarget, { w: number; h: number }> = {
  category: { w: 1200, h: 1200 },
  product:  { w: 1200, h: 1500 },
};

// Pure — returns the source-rectangle to draw (cover/center-crop).
export function computeCoverCrop(
  srcW: number, srcH: number, targetW: number, targetH: number,
): { sx: number; sy: number; sw: number; sh: number };

// DOM/canvas — returns a new WebP File (or the original file untouched
// for SVG/GIF/non-image).
export async function resizeImageFile(
  file: File, target: ResizeTarget,
): Promise<File>;
```

**`computeCoverCrop` math:** the cover crop keeps the largest centered source
rectangle whose aspect ratio equals the target. If `srcW/srcH > targetW/targetH`
the source is too wide → crop width (`sw = srcH * targetW/targetH`, `sx`
centered, `sy=0, sh=srcH`); otherwise crop height. Exact-ratio inputs return the
full rectangle (still re-encoded/downscaled to the target box).

**`resizeImageFile` steps:**
1. If `file.type` is `image/svg+xml`, `image/gif`, or not `image/*` → return
   `file` unchanged.
2. Decode with
   `createImageBitmap(file, { imageOrientation: "from-image" })` — **required**
   so EXIF-rotated phone photos are oriented correctly before cropping
   (default `"none"` would crop them sideways).
3. `computeCoverCrop(bitmap.width, bitmap.height, tw, th)`.
4. Draw the crop onto a `tw × th` canvas via
   `ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, tw, th)`.
5. `canvas.toBlob(cb, "image/webp", 0.85)`. If the blob is `null` (older
   Safari without WebP encode), retry with `"image/jpeg"` @ 0.9.
6. Wrap the blob in a new `File([blob], name, { type: blob.type })` where
   `name` is the original basename with the extension swapped to match the
   encoded type (`.webp` / `.jpg`). Setting the `File`'s `type` explicitly
   ensures Vercel Blob stores the correct content-type.

### Wiring (thread a `target` preset to each upload site)

- `UploadButton` gains `resizeTarget?: ResizeTarget`. In `handleFiles`, each
  picked file is mapped through `resizeImageFile(file, resizeTarget)` **before**
  `uploadOne`. Existing `Promise.allSettled` ordering and the partial-failure
  alert are preserved. When `resizeTarget` is undefined, files upload unchanged
  (backward compatible).
- `ImageInput` gains `resizeTarget?: ResizeTarget` and forwards it to its
  `UploadButton`.
- Call sites:
  | File | Field | `resizeTarget` |
  |------|-------|----------------|
  | `app/_components/admin/categories/category-form.tsx` | category image | `"category"` |
  | `app/_components/admin/products/category-select.tsx` | inline new-category image | `"category"` |
  | `app/_components/admin/products/product-form.tsx` | product main image | `"product"` |
  | `app/_components/admin/products/gallery-editor.tsx` | product gallery (multiple) | `"product"` |

### Preview reflects the crop (small UX add)

`ImageInput`'s preview `<img>` currently uses `h-32 w-full object-cover`. Give it
the target aspect ratio so the admin sees roughly what gets stored:
`aspect-square` for `"category"`, `aspect-[4/5]` for `"product"`, with
`object-cover`. (Purely cosmetic; the actual crop is done at upload time.)

### Ripple: OpenGraph image dimensions

`app/products/[id]/page.tsx:49` declares the product OG image as
`width: 1200, height: 1200`, but `imageUrl` is `detail.product.image` — the
product main image, which becomes **1200×1500**. Update the OG metadata to
`width: 1200, height: 1500` so the declared dimensions match the asset.

## Testing & validation

- **Vitest unit tests** for `computeCoverCrop`: wide→square crops width,
  tall→square crops height, square→4:5 crops height, exact-ratio is a no-op
  rectangle, odd/non-integer dims, 1×1 and large inputs. (Canvas/`toBlob` is not
  available in jsdom, so `resizeImageFile`'s encode path is verified manually.)
- **Manual check:** upload a wide JPEG and a portrait PNG as a product image →
  confirm stored file is `*.webp`, 1200×1500, center-cropped and correctly
  oriented. Upload an SVG → confirm it passes through unchanged.
- `npm run build` and `npm run test` (tsc gate + Vitest — no local DB required).

## Files touched

- **New:** `app/_lib/resize-image.ts`, `app/_lib/__tests__/resize-image.test.ts`
- **Edit:** `upload-button.tsx`, `image-input.tsx`, `category-form.tsx`,
  `category-select.tsx`, `product-form.tsx`, `gallery-editor.tsx`,
  `app/products/[id]/page.tsx`
