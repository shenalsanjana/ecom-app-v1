"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { toggleWishlistAction } from "@/app/wishlist/actions";

type WishlistContextType = {
  ids: ReadonlySet<string>;
  has: (productId: string) => boolean;
  toggle: (productId: string, fromPath?: string) => void;
};

const WishlistContext = createContext<WishlistContextType | null>(null);

function flip(prev: ReadonlySet<string>, productId: string): Set<string> {
  const next = new Set(prev);
  if (next.has(productId)) next.delete(productId);
  else next.add(productId);
  return next;
}

export function WishlistProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useSession();
  const router = useRouter();
  const [realIds, setRealIds] = useState<Set<string>>(new Set());
  const [optimisticIds, applyOptimistic] = useOptimistic(
    realIds,
    (state: ReadonlySet<string>, productId: string) => flip(state, productId)
  );
  const [, startTransition] = useTransition();

  // Hydrate once when authenticated.
  useEffect(() => {
    if (status !== "authenticated") {
      setRealIds(new Set());
      return;
    }
    let cancelled = false;
    fetch("/api/wishlist/ids", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { ids: [] as string[] }))
      .then((data: { ids: string[] }) => {
        if (!cancelled) setRealIds(new Set(data.ids));
      })
      .catch(() => {
        // Network/parse failure: keep an empty set; UI shows empty hearts.
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const has = useCallback(
    (productId: string) => optimisticIds.has(productId),
    [optimisticIds]
  );

  const toggle = useCallback(
    (productId: string, fromPath: string = "/") => {
      if (status !== "authenticated") {
        router.push(`/login?callbackUrl=${encodeURIComponent(fromPath)}`);
        return;
      }
      startTransition(async () => {
        applyOptimistic(productId);
        try {
          const fd = new FormData();
          fd.set("productId", productId);
          fd.set("fromPath", fromPath);
          await toggleWishlistAction(fd);
          setRealIds((prev) => flip(prev, productId));
        } catch {
          // Action threw (network, server error, expired session) — useOptimistic
          // auto-reverts when the transition ends without realIds advancing.
        }
      });
    },
    [status, router, applyOptimistic]
  );

  return (
    <WishlistContext.Provider value={{ ids: optimisticIds, has, toggle }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist(): WishlistContextType {
  const ctx = useContext(WishlistContext);
  if (!ctx) {
    throw new Error("useWishlist must be used within a WishlistProvider");
  }
  return ctx;
}
