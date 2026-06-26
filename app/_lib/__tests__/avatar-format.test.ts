import { describe, it, expect } from "vitest";
import { initials, avatarColor } from "../format";

describe("initials", () => {
  it("takes first + last initial for multi-word names", () => {
    expect(initials("Jane Doe")).toBe("JD");
    expect(initials("Mary Jane Watson")).toBe("MW");
  });

  it("takes the first letter for a single-word name", () => {
    expect(initials("Jane")).toBe("J");
  });

  it("derives from an email when that is all we have", () => {
    expect(initials("jane@example.com")).toBe("J");
  });

  it("uppercases and trims/collapses whitespace", () => {
    expect(initials("  jane   doe  ")).toBe("JD");
  });

  it("returns empty string for empty/whitespace input", () => {
    expect(initials("")).toBe("");
    expect(initials("   ")).toBe("");
  });
});

describe("avatarColor", () => {
  it("returns a bg+text class string", () => {
    expect(avatarColor("Jane Doe")).toMatch(/^bg-\S+ text-\S+$/);
  });

  it("is deterministic for the same seed", () => {
    expect(avatarColor("Jane Doe")).toBe(avatarColor("Jane Doe"));
  });

  it("returns a valid class even for empty seed", () => {
    expect(avatarColor("")).toMatch(/^bg-\S+ text-\S+$/);
  });
});
