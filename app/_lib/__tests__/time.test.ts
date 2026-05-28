import { describe, it, expect } from "vitest";
import { startOfTodaySLT } from "../time";

// Sri Lanka = UTC+5:30, no DST.
// SLT 00:00 corresponds to UTC 18:30 of the previous day.

describe("startOfTodaySLT", () => {
  it("returns SLT day boundary when called at noon SLT", () => {
    // Noon SLT on 2026-05-28 = 06:30 UTC on 2026-05-28
    const noonSlt = new Date("2026-05-28T06:30:00.000Z");
    const result = startOfTodaySLT(noonSlt);
    // SLT 00:00 on 2026-05-28 = UTC 18:30 on 2026-05-27
    expect(result.toISOString()).toBe("2026-05-27T18:30:00.000Z");
  });

  it("returns same-day SLT boundary just after midnight SLT", () => {
    // 00:01 SLT on May 28 = 18:31 UTC on May 27
    const justAfter = new Date("2026-05-27T18:31:00.000Z");
    const result = startOfTodaySLT(justAfter);
    expect(result.toISOString()).toBe("2026-05-27T18:30:00.000Z");
  });

  it("returns previous-day SLT boundary just before midnight SLT", () => {
    // 23:59 SLT on May 27 = 18:29 UTC on May 27
    const justBefore = new Date("2026-05-27T18:29:00.000Z");
    const result = startOfTodaySLT(justBefore);
    // SLT 00:00 on 2026-05-27 = UTC 18:30 on 2026-05-26
    expect(result.toISOString()).toBe("2026-05-26T18:30:00.000Z");
  });
});
