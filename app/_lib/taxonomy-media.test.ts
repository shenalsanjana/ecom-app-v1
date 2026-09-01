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
