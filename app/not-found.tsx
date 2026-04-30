import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <p className="text-sm font-medium text-muted-foreground">404</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
          <p className="mt-3 text-muted-foreground">
            We couldn&apos;t find what you were looking for.
          </p>
          <Link href="/" className={buttonVariants({ className: "mt-6" })}>
            Back to home
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
