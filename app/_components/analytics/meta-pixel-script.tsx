"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { pixelIds, track } from "@/app/_lib/meta-pixel";
import { metaPixelBootstrap } from "@/app/_lib/meta-pixel-bootstrap";

// Loads the Meta Pixel base code once and fires PageView on client navigations.
// Renders nothing when neither Pixel ID is configured.
export function MetaPixelScript() {
  const ids = pixelIds();
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  // The Meta base snippet fires the initial PageView itself. App Router client
  // navigations don't reload the page, so fire PageView on subsequent path
  // changes only. Comparing paths also avoids an extra fire on effect replay.
  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    track("PageView");
  }, [pathname]);

  if (ids.length === 0) return null;

  return (
    <>
      <Script id="meta-pixel-base" strategy="afterInteractive">
        {metaPixelBootstrap(ids)}
      </Script>
      {/* Standard <noscript> fallback: fires a PageView for JS-disabled
          visitors. A tracking pixel must be a plain <img>, not next/image. */}
      <noscript>
        {ids.map((id) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={id}
            height="1"
            width="1"
            style={{ display: "none" }}
            src={`https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1`}
            alt=""
          />
        ))}
      </noscript>
    </>
  );
}
