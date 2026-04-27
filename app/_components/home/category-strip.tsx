import Image from "next/image";
import Link from "next/link";
import { categories } from "@/app/_data/mock";

export function CategoryStrip() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight">Shop by category</h2>
        <ul className="grid grid-cols-3 gap-6 sm:grid-cols-6">
          {categories.map((c) => (
            <li key={c.slug} className="flex flex-col items-center gap-3">
              <Link
                href="#"
                className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-100 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                <Image src={c.image} alt={c.name} width={36} height={36} className="dark:invert" />
              </Link>
              <span className="text-sm font-medium">{c.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
