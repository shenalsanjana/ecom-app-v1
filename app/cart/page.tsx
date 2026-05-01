// app/cart/page.tsx
import { auth } from "@/app/_lib/auth";
import { getWishlistCount } from "@/app/_lib/wishlist";
import { CartPageClient } from "@/app/_components/cart/cart-page-client";

export default async function CartPage() {
  const session = await auth();
  const user = session?.user
    ? { name: session.user.name ?? "", email: session.user.email ?? "" }
    : null;
  const wishlistCount = session?.user?.id ? await getWishlistCount(session.user.id) : 0;
  const loggedIn = !!session?.user;

  return (
    <CartPageClient
      user={user}
      loggedIn={loggedIn}
      wishlistCount={wishlistCount}
    />
  );
}
