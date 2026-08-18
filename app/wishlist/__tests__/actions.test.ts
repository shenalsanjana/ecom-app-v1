import { beforeEach, describe, expect, it, vi } from "vitest";

const { wishlistFindUnique, wishlistCreate, wishlistDelete } = vi.hoisted(() => ({
  wishlistFindUnique: vi.fn(async (): Promise<{ id: string } | null> => null),
  wishlistCreate: vi.fn(async () => ({})),
  wishlistDelete: vi.fn(async () => ({})),
}));

vi.mock("@/app/_lib/session-user", () => ({
  getVerifiedSessionUser: vi.fn(async () => ({ id: "U1", name: "Jane", email: "j@example.com" })),
}));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: {
    wishlistItem: {
      findUnique: wishlistFindUnique,
      create: wishlistCreate,
      delete: wishlistDelete,
    },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import { getVerifiedSessionUser } from "@/app/_lib/session-user";
import { toggleWishlistAction } from "../actions";

function formData(productId: string, fromPath = "/products/tee") {
  const fd = new FormData();
  fd.set("productId", productId);
  fd.set("fromPath", fromPath);
  return fd;
}

beforeEach(() => {
  wishlistFindUnique.mockReset().mockResolvedValue(null);
  wishlistCreate.mockReset().mockResolvedValue({});
  wishlistDelete.mockReset().mockResolvedValue({});
  vi.mocked(getVerifiedSessionUser).mockReset().mockResolvedValue({ id: "U1", name: "Jane", email: "j@example.com" });
});

describe("toggleWishlistAction", () => {
  it("creates the wishlist item for a verified user", async () => {
    await toggleWishlistAction(formData("P1"));

    expect(wishlistCreate).toHaveBeenCalledWith({ data: { userId: "U1", productId: "P1" } });
  });

  it("removes an existing item instead of creating a duplicate", async () => {
    wishlistFindUnique.mockResolvedValue({ id: "W1" });

    await toggleWishlistAction(formData("P1"));

    expect(wishlistDelete).toHaveBeenCalledWith({ where: { id: "W1" } });
    expect(wishlistCreate).not.toHaveBeenCalled();
  });

  it("never writes a userId whose User row no longer exists", async () => {
    // A valid, correctly-signed JWT naming a deleted user previously reached
    // wishlistItem.create and violated WishlistItem_userId_fkey.
    vi.mocked(getVerifiedSessionUser).mockResolvedValue(null as never);

    await expect(toggleWishlistAction(formData("P1"))).rejects.toThrow(/NEXT_REDIRECT/);

    expect(wishlistCreate).not.toHaveBeenCalled();
    expect(wishlistDelete).not.toHaveBeenCalled();
  });

  it("sends a stale session back to sign in, returning to the originating page", async () => {
    vi.mocked(getVerifiedSessionUser).mockResolvedValue(null as never);

    await expect(toggleWishlistAction(formData("P1", "/products/tee"))).rejects.toThrow(
      /login\?callbackUrl=%2Fproducts%2Ftee/,
    );
  });

  it("ignores a submission with no productId", async () => {
    const fd = new FormData();
    fd.set("fromPath", "/");

    await toggleWishlistAction(fd);

    expect(getVerifiedSessionUser).not.toHaveBeenCalled();
    expect(wishlistCreate).not.toHaveBeenCalled();
  });
});
