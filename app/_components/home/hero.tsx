import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="border-b bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-950 dark:via-black dark:to-zinc-900">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24 lg:px-8">
        <div className="space-y-6">
          <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Spring collection
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Everyday essentials, curated for you.
          </h1>
          <p className="max-w-md text-lg text-muted-foreground">
            Discover hand-picked products from independent makers and trusted brands —
            shipped fast, returned freely.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg">
              Shop now <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline">
              Browse categories
            </Button>
          </div>
        </div>
        <div className="relative h-72 overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-900 md:h-96">
          <Image
            src="/banners/spring-collection.jpg"
            alt="Dressing Bear — unleash your inner bear"
            fill
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}
