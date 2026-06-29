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
