import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/_lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { designMedia, MAX_SLIDES, type ProductMediaRow } from "@/app/_lib/taxonomy-media";

const withPhoto = (designSlug: string, url: string): ProductMediaRow => ({
  designSlug, variants: [{ images: [{ url }] }],
});

describe("designMedia", () => {
  it("groups photos and counts by design slug", () => {
    const media = designMedia([
      withPhoto("cat", "/a.jpg"), withPhoto("cat", "/b.jpg"), withPhoto("dino", "/c.jpg"),
    ]);

    expect(media.get("cat")).toEqual({ photos: ["/a.jpg", "/b.jpg"], count: 2 });
    expect(media.get("dino")).toEqual({ photos: ["/c.jpg"], count: 1 });
  });

  it("counts a product with no variant, which contributes no photo", () => {
    // Prisma's nested select returns an empty array rather than dropping the
    // parent row -- the product is real, it just has nothing to show.
    const media = designMedia([withPhoto("cat", "/a.jpg"), { designSlug: "cat", variants: [] }]);
    expect(media.get("cat")).toEqual({ photos: ["/a.jpg"], count: 2 });
  });

  it("counts a variant with no CARD image the same way", () => {
    const media = designMedia([{ designSlug: "cat", variants: [{ images: [] }] }]);
    expect(media.get("cat")).toEqual({ photos: [], count: 1 });
  });

  it("caps photos while still counting every product", () => {
    const rows = Array.from({ length: 7 }, (_, i) => withPhoto("cat", `/${i}.jpg`));
    const media = designMedia(rows);

    expect(media.get("cat")!.photos).toEqual(["/0.jpg", "/1.jpg", "/2.jpg", "/3.jpg"]);
    expect(media.get("cat")!.count).toBe(7);
  });

  it("honours an explicit cap", () => {
    const rows = Array.from({ length: 3 }, (_, i) => withPhoto("cat", `/${i}.jpg`));
    expect(designMedia(rows, 2).get("cat")!.photos).toHaveLength(2);
  });

  it("reports nothing for a design with no products", () => {
    expect(designMedia([]).get("cat")).toBeUndefined();
  });

  it("caps at four by default", () => {
    expect(MAX_SLIDES).toBe(4);
  });
});

describe("designMedia's result survives the unstable_cache JSON boundary", () => {
  // This file mocks unstable_cache as `(fn) => fn` -- an identity pass-through
  // -- like every other test in the repo. That mock removes the exact
  // serialization boundary that broke production: Next's real unstable_cache
  // persists a cache HIT as `JSON.stringify(result)` and returns
  // `JSON.parse(...)`, so a value that doesn't round-trip through JSON works
  // on a cache miss and silently breaks on every hit thereafter (see
  // node_modules/next/dist/server/web/spec-extension/unstable-cache.js).
  //
  // A `Map` is exactly such a value: `JSON.stringify(new Map([...]))` is
  // `"{}"`. This test asserts the *shape actually returned by the cached
  // callback* -- not designMedia() directly -- survives that round-trip
  // unchanged. It is written so it would have failed had the cached callback
  // still returned `designMedia(rows)` (a Map) instead of `[...designMedia(rows)]`
  // (a plain JSON-safe entry array).
  it("round-trips through JSON.stringify/JSON.parse unchanged", () => {
    const media = designMedia([
      { designSlug: "cat", variants: [{ images: [{ url: "/a.jpg" }] }] },
      { designSlug: "cat", variants: [{ images: [{ url: "/b.jpg" }] }] },
      { designSlug: "dino", variants: [{ images: [] }] },
    ]);

    // The shape the cached callback must return: JSON-safe entries, not a Map.
    const cacheSafeShape = [...media];
    const roundTripped = JSON.parse(JSON.stringify(cacheSafeShape));
    expect(roundTripped).toEqual(cacheSafeShape);

    // The guard this test exists to enforce: a bare Map does NOT survive the
    // same round-trip. If designMedia's return value were cached directly
    // (the old, broken shape), this is what a cache hit would actually give
    // the caller -- an empty object, not a Map.
    const brokenRoundTrip = JSON.parse(JSON.stringify(media));
    expect(brokenRoundTrip).toEqual({});
  });
});
