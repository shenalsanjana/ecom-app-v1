import { describe, it, expect } from "vitest";
import { computeCoverCrop, computeContainedDimensions, resizeImageFile } from "../resize-image";

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

describe("product image dimensions", () => {
  it("retains the complete landscape collage within the product bounds", () => {
    expect(computeContainedDimensions(1448, 1086, 1200, 1500)).toEqual({ w: 1200, h: 900 });
  });

  it("retains the top and bottom of a tall infographic", () => {
    expect(computeContainedDimensions(1000, 2000, 1200, 1500)).toEqual({ w: 750, h: 1500 });
  });

  it("does not upscale smaller product photos", () => {
    expect(computeContainedDimensions(600, 450, 1200, 1500)).toEqual({ w: 600, h: 450 });
  });
});

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
