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
