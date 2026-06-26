"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { isPixelConfigured, pixelId, track } from "@/app/_lib/meta-pixel";

// Loads the Meta Pixel base code once and fires PageView on client navigations.
// Renders nothing when NEXT_PUBLIC_META_PIXEL_ID is unset — the site then
// behaves exactly as before (no fbq global, every track() call no-ops).
export function MetaPixelScript() {
  const id = pixelId();
  const pathname = usePathname();
  const firstRun = useRef(true);

  // The Meta base snippet fires the initial PageView itself. App Router client
  // navigations don't reload the page, so fire PageView on subsequent path
  // changes only (skip the first effect run to avoid double-counting load).
  useEffect(() => {
    if (!isPixelConfigured()) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    track("PageView");
  }, [pathname]);

  if (!id) return null;

  return (
    <>
      <Script id="meta-pixel-base" strategy="afterInteractive">
        {`
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window,document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${id}');
        fbq('track', 'PageView');
      `}
      </Script>
      {/* Standard <noscript> fallback: fires a PageView for JS-disabled
          visitors. A tracking pixel must be a plain <img>, not next/image. */}
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
