import { beforeEach, describe, expect, it, vi } from "vitest";

const { userFindUnique } = vi.hoisted(() => ({
  userFindUnique: vi.fn(async (): Promise<{ id: string } | null> => ({ id: "U1" })),
}));

vi.mock("@/app/_lib/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: { user: { findUnique: userFindUnique } },
}));

import { auth } from "@/app/_lib/auth";
import { getVerifiedSessionUser } from "../session-user";

beforeEach(() => {
  vi.mocked(auth).mockReset();
  userFindUnique.mockReset().mockResolvedValue({ id: "U1" });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("getVerifiedSessionUser", () => {
  it("returns null when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    expect(await getVerifiedSessionUser()).toBeNull();
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("returns the verified user when the row exists", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "U1", name: "Jane", email: "j@example.com" },
    } as never);

    expect(await getVerifiedSessionUser()).toEqual({
      id: "U1",
      name: "Jane",
      email: "j@example.com",
    });
  });

  it("returns null when the session names a user that no longer exists", async () => {
    // The whole point: the JWT is valid and correctly signed, but the row is gone.
    // Returning the id here is what violated Order_userId_fkey / WishlistItem_userId_fkey.
    vi.mocked(auth).mockResolvedValue({ user: { id: "U-DELETED" } } as never);
    userFindUnique.mockResolvedValue(null);

    expect(await getVerifiedSessionUser()).toBeNull();
  });

  it("logs the stale id so a run of them is visible in the logs", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "U-DELETED" } } as never);
    userFindUnique.mockResolvedValue(null);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await getVerifiedSessionUser();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("no longer exists"),
      expect.objectContaining({ sessionUserId: "U-DELETED" }),
    );
  });
});
