"use client";

import { useEffect } from "react";
import { trackViewCategory } from "@/app/_lib/meta-pixel";

// Fires a ViewCategory pixel event once per category view. The category page is
// an ISR Server Component and cannot run client tracking itself, so this tiny
// leaf does it — mirroring how buy-box-client fires ViewContent. Keyed on `name`
// so a client-side navigation between categories re-fires for the new one.
export function TrackCategoryView({ name }: { name: string }) {
  useEffect(() => {
    trackViewCategory(name);
  }, [name]);
  return null;
}
