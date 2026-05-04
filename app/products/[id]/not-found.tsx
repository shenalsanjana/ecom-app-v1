import Link from "next/link";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";

export default function ProductNotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Product not found</h1>
        <p className="mt-4 text-muted-foreground">
          The product you&apos;re looking for is no longer available, or the link is broken.
        </p>
        <Link
          href="/categories"
          className="mt-8 inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Browse all products
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
