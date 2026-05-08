import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="border-b bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-black dark:to-zinc-900">
      <div className="mx-auto max-w-7xl space-y-10 px-4 py-12 sm:px-6 md:py-16 lg:px-8">
        <div className="relative aspect-[1640/624] w-full overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-900">
          <Image
            src="/banners/spring-collection.jpg"
            alt="Dressing Bear — unleash your inner bear"
            fill
            priority
            sizes="(min-width: 1280px) 1280px, 100vw"
            className="object-cover"
          />
        </div>
        <div className="mx-auto max-w-2xl space-y-6 text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Spring collection
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Everyday essentials, curated for you.
          </h1>
          <p className="text-lg text-muted-foreground">
            Discover hand-picked products from independent makers and trusted brands —
            shipped fast, returned freely.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg">
              Shop now <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline">
              Browse categories
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
