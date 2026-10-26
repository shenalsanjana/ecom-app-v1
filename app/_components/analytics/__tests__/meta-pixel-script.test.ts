import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pathname: "/",
  ref: undefined as { current: string } | undefined,
  effects: [] as (() => void)[],
}));

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/script", () => ({ default: "script" }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useRef: (initial: string) => state.ref ??= { current: initial },
  useEffect: (effect: () => void) => { state.effects.push(effect); },
}));

import { MetaPixelScript } from "../meta-pixel-script";

const PRIMARY_ID = "1767244997622143";
const SECONDARY_ID = "1770550114263259";

describe("MetaPixelScript", () => {
  beforeEach(() => {
    state.pathname = "/";
    state.ref = undefined;
    state.effects = [];
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", PRIMARY_ID);
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID_SECONDARY", SECONDARY_ID);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("renders one bootstrap and a noscript fallback for each Pixel", () => {
    const html = renderToStaticMarkup(MetaPixelScript());
    expect(html.match(/id="meta-pixel-base"/g)).toHaveLength(1);
    for (const id of [PRIMARY_ID, SECONDARY_ID]) {
      expect(html).toContain(`facebook.com/tr?id=${id}&amp;ev=PageView&amp;noscript=1`);
    }
  });

  it("does not render a loader or fallbacks when both IDs are empty", () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "");
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID_SECONDARY", "");
    expect(MetaPixelScript()).toBeNull();
  });

  it("deduplicates the loader fallbacks when both variables contain the same ID", () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID_SECONDARY", PRIMARY_ID);
    const html = renderToStaticMarkup(MetaPixelScript());
    expect(html.match(/facebook.com\/tr\?id=/g)).toHaveLength(1);
  });

  it("sends one PageView per Pixel on pathname changes, including effect replay and back navigation", () => {
    const fbq = vi.fn();
    vi.stubGlobal("window", { fbq });
    const renderAndReplayEffect = () => {
      MetaPixelScript();
      const effect = state.effects.pop()!;
      effect();
      effect();
    };
    renderAndReplayEffect();
    expect(fbq).not.toHaveBeenCalled(); // The bootstrap owns initial PageView.

    state.pathname = "/products/bear";
    renderAndReplayEffect();
    renderAndReplayEffect();
    expect(fbq.mock.calls).toEqual([
      ["trackSingle", PRIMARY_ID, "PageView", {}],
      ["trackSingle", SECONDARY_ID, "PageView", {}],
    ]);

    state.pathname = "/";
    renderAndReplayEffect();
    expect(fbq).toHaveBeenCalledTimes(4);
  });
});
