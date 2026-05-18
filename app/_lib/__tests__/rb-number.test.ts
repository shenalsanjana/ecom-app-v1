import { describe, it, expect, vi } from "vitest";
import { nextRbNumber } from "@/app/_lib/rb-number";
import type { Prisma } from "@prisma/client";

function makeMockTx(nextValue: bigint): Prisma.TransactionClient {
  const queryRaw = vi.fn().mockResolvedValue([{ next: nextValue }]);
  return { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient;
}

describe("nextRbNumber", () => {
  it("formats the sequence value with the RB prefix", async () => {
    const tx = makeMockTx(1001n);
    const result = await nextRbNumber(tx);
    expect(result).toBe("RB1001");
  });

  it("handles arbitrary sequence values", async () => {
    const tx = makeMockTx(1042n);
    expect(await nextRbNumber(tx)).toBe("RB1042");
  });

  it("handles values beyond 9999", async () => {
    const tx = makeMockTx(10001n);
    expect(await nextRbNumber(tx)).toBe("RB10001");
  });

  it("calls $queryRaw on the provided client", async () => {
    const tx = makeMockTx(1001n);
    await nextRbNumber(tx);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
