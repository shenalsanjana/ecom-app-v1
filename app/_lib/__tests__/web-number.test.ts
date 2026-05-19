import { describe, it, expect, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { nextWebNumber } from "../web-number";

function mkTx(nextValue: bigint): Prisma.TransactionClient {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ next: nextValue }]),
  } as unknown as Prisma.TransactionClient;
}

describe("nextWebNumber", () => {
  it("returns WEB0001 for the first sequence value", async () => {
    expect(await nextWebNumber(mkTx(1n))).toBe("WEB0001");
  });

  it("zero-pads to 4 digits", async () => {
    expect(await nextWebNumber(mkTx(42n))).toBe("WEB0042");
    expect(await nextWebNumber(mkTx(99n))).toBe("WEB0099");
    expect(await nextWebNumber(mkTx(9999n))).toBe("WEB9999");
  });

  it("grows naturally past 9999 (5-digit overflow)", async () => {
    expect(await nextWebNumber(mkTx(10000n))).toBe("WEB10000");
    expect(await nextWebNumber(mkTx(123456n))).toBe("WEB123456");
  });
});
