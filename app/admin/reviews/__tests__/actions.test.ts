import { describe, it, expect, beforeEach, vi } from "vitest";

const { reviewUpdate, reviewDelete, revalidatePath, revalidateTag, requireAdmin } =
  vi.hoisted(() => ({
    reviewUpdate: vi.fn(),
    reviewDelete: vi.fn(),
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
    requireAdmin: vi.fn(),
  }));

vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));
vi.mock("@/app/_lib/prisma", () => ({
  prisma: { review: { update: reviewUpdate, delete: reviewDelete } },
}));
vi.mock("@/app/_lib/admin-auth", () => ({ requireAdmin }));

import { approveReview, deleteReview } from "../actions";

beforeEach(() => {
  reviewUpdate.mockReset().mockResolvedValue({ id: "r1" });
  reviewDelete.mockReset().mockResolvedValue({ id: "r1" });
  revalidatePath.mockReset();
  revalidateTag.mockReset();
  requireAdmin.mockReset().mockResolvedValue({ user: { name: "Admin" } });
});

describe("review moderation actions", () => {
  it("approveReview sets approved:true and busts the catalog cache", async () => {
    const res = await approveReview("r1");
    expect(res.success).toBe(true);
    expect(reviewUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: "r1" }, data: { approved: true },
    });
    expect(revalidateTag).toHaveBeenCalledWith("catalog", "max");
  });

  it("approveReview requires admin", async () => {
    await approveReview("r1");
    expect(requireAdmin).toHaveBeenCalled();
  });

  it("deleteReview removes the review", async () => {
    const res = await deleteReview("r1");
    expect(res.success).toBe(true);
    expect(reviewDelete.mock.calls[0][0]).toMatchObject({ where: { id: "r1" } });
  });
});
