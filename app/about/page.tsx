import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/app/_components/home/site-header";
import { SiteFooter } from "@/app/_components/home/site-footer";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "About - Dressing Bear",
  description: "Learn about Dressing Bear and our oversize t-shirt collection.",
};

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b bg-muted/30">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">About Dressing Bear</h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Premium oversize t-shirts, designed for comfort and built to last.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="prose prose-zinc dark:prose-invert max-w-none space-y-6">
            <section aria-labelledby="story-heading">
              <h2 id="story-heading" className="text-xl font-semibold">Our Story</h2>
              <p>
                Dressing Bear started with a simple idea: oversize t-shirts that actually fit
                right and feel premium. We were tired of paying for shapeless tees that lost
                their shape after a few washes, so we set out to make something better.
              </p>
            </section>

            <section aria-labelledby="quality-heading">
              <h2 id="quality-heading" className="text-xl font-semibold">Quality First</h2>
              <p>
                Every piece is made from heavyweight cotton and finished with reinforced seams.
                We choose fabrics that get softer with wear and prints that hold up to repeated
                washes. We&apos;d rather make fewer pieces really well than ship a lot of mediocre ones.
              </p>
            </section>

            <section aria-labelledby="commitment-heading">
              <h2 id="commitment-heading" className="text-xl font-semibold">Our Commitment</h2>
              <p>
                We ship across Sri Lanka with cash on delivery, hassle-free returns within 14
                days, and customer support you can actually reach. If something isn&apos;t right,
                tell us &mdash; we&apos;ll make it right.
              </p>
            </section>

            <section aria-labelledby="contact-heading">
              <h2 id="contact-heading" className="text-xl font-semibold">Get in Touch</h2>
              <p>
                Questions, feedback, or just want to say hi? Reach us at{" "}
                <a href="mailto:dressingbear@gmail.com" className="text-primary hover:underline">
                  dressingbear@gmail.com
                </a>{" "}
                or call +94 740545536. You can also use our{" "}
                <Link href="/contact" className="text-primary hover:underline">
                  contact form
                </Link>
                .
              </p>
            </section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
