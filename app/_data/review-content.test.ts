import { describe, it, expect } from "vitest";
import {
  REVIEW_AUTHORS,
  SHARED_REVIEWS,
  CATEGORY_REVIEWS,
  reviewPoolForCategory,
  type ReviewTemplate,
} from "./review-content";

const allTemplates: ReviewTemplate[] = [
  ...SHARED_REVIEWS,
  ...Object.values(CATEGORY_REVIEWS).flat(),
];

describe("review-content", () => {
  it("every template has a 1–5 rating and a non-empty body", () => {
    for (const t of allTemplates) {
      expect(t.rating).toBeGreaterThanOrEqual(1);
      expect(t.rating).toBeLessThanOrEqual(5);
      expect(t.body.trim().length).toBeGreaterThan(0);
    }
  });

  it("has a pool of >= 20 unique Sri Lankan author names", () => {
    expect(REVIEW_AUTHORS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(REVIEW_AUTHORS).size).toBe(REVIEW_AUTHORS.length);
  });

  it("each category template mentions its own keyword", () => {
    // Hyphenated slugs won't appear as a literal substring in natural review
    // text, so map them to the keyword we actually expect to see instead.
    const KEYWORD_OVERRIDES: Record<string, string> = {
      "just-grow": "grow",
      "sea-lovers": "sea",
    };
    for (const [slug, templates] of Object.entries(CATEGORY_REVIEWS)) {
      const keyword = KEYWORD_OVERRIDES[slug] ?? slug;
      for (const t of templates) {
        const text = `${t.title ?? ""} ${t.body}`.toLowerCase();
        expect(text).toContain(keyword); // cat / dino / stitch / ...
      }
    }
  });

  it("reviewPoolForCategory concatenates shared + category templates", () => {
    expect(reviewPoolForCategory("cat")).toEqual([
      ...SHARED_REVIEWS,
      ...CATEGORY_REVIEWS.cat,
    ]);
  });

  it("returns just the shared pool for an unknown category", () => {
    expect(reviewPoolForCategory("nope")).toEqual(SHARED_REVIEWS);
  });

  it("maps the live 'cats' slug onto the 'cat' template set", () => {
    expect(reviewPoolForCategory("cats")).toEqual(reviewPoolForCategory("cat"));
    // ...and that's more than the shared pool, i.e. cat templates are included.
    expect(reviewPoolForCategory("cats").length).toBeGreaterThan(SHARED_REVIEWS.length);
  });

  it("gives each category >= 15 templates (variety for 5–10 shown)", () => {
    for (const slug of Object.keys(CATEGORY_REVIEWS)) {
      expect(reviewPoolForCategory(slug).length).toBeGreaterThanOrEqual(15);
    }
  });
});
