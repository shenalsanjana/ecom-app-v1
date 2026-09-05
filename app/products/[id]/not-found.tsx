import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";

export default function ProductNotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center">
        <h1 className="font-heading text-4xl font-semibold tracking-tight">Product not found</h1>
        <p className="mt-4 text-muted-foreground">
          The product you&apos;re looking for is no longer available, or the link is broken.
        </p>
        <Link
          href="/"
          className={buttonVariants({ variant: "brand", size: "lg", className: "mt-8" })}
        >
          Browse all products
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
