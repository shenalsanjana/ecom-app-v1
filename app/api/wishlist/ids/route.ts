import { NextResponse } from "next/server";
import { auth } from "@/app/_lib/auth";
import { getWishlistProductIds } from "@/app/_lib/wishlist";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ids: [] }, { headers: NO_STORE });
  }
  const ids = await getWishlistProductIds(session.user.id);
  return NextResponse.json(
    { ids: Array.from(ids) },
    { headers: NO_STORE }
  );
}
