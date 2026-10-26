import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { metaPixelBootstrap } from "../meta-pixel-bootstrap";

const PRIMARY_ID = "1767244997622143";
const SECONDARY_ID = "1770550114263259";

function browser() {
  const insertBefore = vi.fn();
  const context = createContext({
    document: {
      createElement: vi.fn(() => ({})),
      getElementsByTagName: vi.fn(() => [{ parentNode: { insertBefore } }]),
    },
  });
  context.window = context;
  const calls = () => Array.from(context.fbq?.queue ?? [], (args) => Array.from(args as unknown[]));
  return { context, insertBefore, calls };
}

describe("Meta Pixel bootstrap", () => {
  it("loads one runtime, initializes both IDs, and queues one PageView per Pixel", () => {
    const { context, insertBefore, calls } = browser();
    runInContext(metaPixelBootstrap([PRIMARY_ID, SECONDARY_ID]), context);
    expect(insertBefore).toHaveBeenCalledTimes(1);
    expect(insertBefore.mock.calls[0][0]).toMatchObject({ src: "https://connect.facebook.net/en_US/fbevents.js", async: true });
    expect(calls()).toEqual([
      ["init", PRIMARY_ID],
      ["init", SECONDARY_ID],
      ["trackSingle", PRIMARY_ID, "PageView"],
      ["trackSingle", SECONDARY_ID, "PageView"],
    ]);
  });

  it("does not reinitialize or resend PageView when the bootstrap executes twice", () => {
    const { context, insertBefore, calls } = browser();
    const script = metaPixelBootstrap([PRIMARY_ID, SECONDARY_ID]);
    runInContext(script, context);
    runInContext(script, context);
    expect(insertBefore).toHaveBeenCalledTimes(1);
    expect(calls()).toHaveLength(4);
  });

  it("does not reinitialize or resend PageView for an already initialized primary", () => {
    const { context, insertBefore, calls } = browser();
    runInContext(metaPixelBootstrap([PRIMARY_ID]), context);
    runInContext(metaPixelBootstrap([PRIMARY_ID, SECONDARY_ID]), context);
    expect(insertBefore).toHaveBeenCalledTimes(1);
    expect(calls()).toEqual([
      ["init", PRIMARY_ID], ["trackSingle", PRIMARY_ID, "PageView"],
      ["init", SECONDARY_ID], ["trackSingle", SECONDARY_ID, "PageView"],
    ]);
  });

  it("initializes a repeated ID only once", () => {
    const { context, calls } = browser();
    runInContext(metaPixelBootstrap([PRIMARY_ID, ` ${PRIMARY_ID} `]), context);
    expect(calls()).toEqual([["init", PRIMARY_ID], ["trackSingle", PRIMARY_ID, "PageView"]]);
  });

  it("reuses an existing fbq without loading a second runtime", () => {
    const { context, insertBefore } = browser();
    context.fbq = vi.fn();
    runInContext(metaPixelBootstrap([PRIMARY_ID, SECONDARY_ID]), context);
    expect(insertBefore).not.toHaveBeenCalled();
    expect(context.fbq.mock.calls).toEqual([
      ["init", PRIMARY_ID], ["init", SECONDARY_ID],
      ["trackSingle", PRIMARY_ID, "PageView"], ["trackSingle", SECONDARY_ID, "PageView"],
    ]);
  });

  it("emits no script when no valid numeric IDs are configured", () => {
    expect(metaPixelBootstrap([])).toBe("");
    expect(metaPixelBootstrap(["", "bad-id", "</script>"])).toBe("");
  });
});
