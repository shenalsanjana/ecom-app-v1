import { describe, it, expect } from "vitest";
import { msUntilEndOfDay, formatCountdown } from "./countdown";

describe("formatCountdown", () => {
  it("pads every field to two digits", () => {
    expect(formatCountdown(0)).toBe("00:00:00");
    expect(formatCountdown(1000)).toBe("00:00:01");
    expect(formatCountdown(61_000)).toBe("00:01:01");
  });

  it("formats a full day boundary", () => {
    expect(formatCountdown(23 * 3600_000 + 59 * 60_000 + 59_000)).toBe("23:59:59");
  });

  it("truncates sub-second remainders rather than rounding up", () => {
    expect(formatCountdown(1999)).toBe("00:00:01");
  });

  it("clamps negatives to zero instead of rendering a negative clock", () => {
    expect(formatCountdown(-5000)).toBe("00:00:00");
  });
});

describe("msUntilEndOfDay", () => {
  it("counts to 23:59:59.999 of the same local day", () => {
    const now = new Date(2026, 7, 19, 23, 59, 58, 0);
    expect(msUntilEndOfDay(now)).toBe(1999);
  });

  it("returns nearly a full day just after local midnight", () => {
    const now = new Date(2026, 7, 19, 0, 0, 0, 0);
    expect(msUntilEndOfDay(now)).toBe(24 * 3600_000 - 1);
  });

  it("is always positive within a day", () => {
    const now = new Date(2026, 7, 19, 23, 59, 59, 999);
    expect(msUntilEndOfDay(now)).toBe(0);
  });

  it("composes with formatCountdown to a sane clock", () => {
    const now = new Date(2026, 7, 19, 21, 0, 0, 0);
    expect(formatCountdown(msUntilEndOfDay(now))).toBe("02:59:59");
  });
});
