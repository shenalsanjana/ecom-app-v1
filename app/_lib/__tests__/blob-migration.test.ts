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
