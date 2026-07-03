import { describe, it, expect, beforeEach, vi } from "vitest";

const { reviewCreate, productFindUnique, authMock } = vi.hoisted(() => ({
  reviewCreate: vi.fn(),
  productFindUnique: vi.fn(),
  authMock: vi.fn(),
}));

vi.mock("@/app/_lib/prisma", () => ({
  prisma: { review: { create: reviewCreate }, product: { findUnique: productFindUnique } },
}));
vi.mock("@/app/_lib/auth", () => ({ auth: authMock }));

import { submitReview, type ReviewFormState } from "../actions";

const empty: ReviewFormState = {};
function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

beforeEach(() => {
  reviewCreate.mockReset().mockResolvedValue({ id: "r1" });
  productFindUnique.mockReset().mockResolvedValue({ id: "cat-white" });
  authMock.mockReset().mockResolvedValue(null);
});

describe("submitReview", () => {
  it("creates a pending, non-synthetic review on valid input", async () => {
    const res = await submitReview("cat-white", empty, fd({
      rating: "5", title: "Cute", body: "The cat print is lovely and soft.", authorName: "Nimal",
    }));
    expect(res.success).toBe(true);
    const data = reviewCreate.mock.calls[0][0].data;
    expect(data.approved).toBe(false);
    expect(data.synthetic).toBe(false);
    expect(data.rating).toBe(5);
    expect(data.productId).toBe("cat-white");
  });

  it("rejects a body under 10 chars with a field error", async () => {
    const res = await submitReview("cat-white", empty, fd({
      rating: "4", body: "short", authorName: "Nimal",
    }));
    expect(res.fieldErrors?.body).toBeDefined();
    expect(reviewCreate).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range rating", async () => {
    const res = await submitReview("cat-white", empty, fd({
      rating: "9", body: "The cat print is lovely and soft.", authorName: "Nimal",
    }));
    expect(res.fieldErrors?.rating).toBeDefined();
    expect(reviewCreate).not.toHaveBeenCalled();
  });

  it("silently drops honeypot submissions", async () => {
    const res = await submitReview("cat-white", empty, fd({
      rating: "5", body: "The cat print is lovely and soft.", authorName: "Bot", company: "spam",
    }));
    expect(res.success).toBe(true);
    expect(reviewCreate).not.toHaveBeenCalled();
  });

  it("falls back to the session name when the name field is blank", async () => {
    authMock.mockResolvedValueOnce({ user: { name: "Session User" } });
    await submitReview("cat-white", empty, fd({
      rating: "5", body: "The cat print is lovely and soft.", authorName: "",
    }));
    expect(reviewCreate.mock.calls[0][0].data.authorName).toBe("Session User");
  });
});
