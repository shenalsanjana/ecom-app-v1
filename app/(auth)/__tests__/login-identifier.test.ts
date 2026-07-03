import { describe, it, expect } from "vitest";
import { resolveIdentifier } from "@/app/_lib/phone";

describe("login identifier resolution", () => {
  it("routes a phone to a canonical phone lookup", () => {
    expect(resolveIdentifier("0771234567")).toEqual({ kind: "phone", value: "+94771234567" });
  });
  it("routes an email to an email lookup", () => {
    expect(resolveIdentifier("me@x.test")).toEqual({ kind: "email", value: "me@x.test" });
  });
});
