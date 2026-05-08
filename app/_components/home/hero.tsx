import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="border-b">
      <div className="relative min-h-[420px] w-full overflow-hidden md:min-h-[560px] lg:min-h-[640px]">
        <Image
          src="/banners/spring-collection.jpg"
          alt="Dressing Bear — unleash your inner bear"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
        <div className="relative mx-auto flex min-h-[420px] max-w-7xl items-end px-4 py-10 sm:px-6 md:min-h-[560px] md:py-14 lg:min-h-[640px] lg:px-8">
          <div className="max-w-xl space-y-6 text-white drop-shadow-md">
            <p className="text-sm font-medium uppercase tracking-wider text-white/85">
              Spring collection
            </p>
            <h1 className="font-heading text-4xl font-medium leading-tight tracking-tight md:text-5xl lg:text-6xl">
              Everyday essentials, curated for you.
            </h1>
            <p className="text-lg text-white/90">
              Discover hand-picked products from independent makers and trusted brands —
              shipped fast, returned freely.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/categories" className={buttonVariants({ size: "lg" })}>
                Shop now <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/categories"
                className={buttonVariants({
                  size: "lg",
                  variant: "outline",
                  className:
                    "border-white/70 bg-white/10 text-white hover:bg-white/20 hover:text-white",
                })}
              >
                Browse categories
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
