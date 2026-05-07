import Image from "next/image";
import Link from "next/link";
import { getCategories } from "@/app/_lib/products";

export async function CategoryStrip() {
  const categories = await getCategories();
  return (
    <section className="border-b">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight">Shop by category</h2>
        <ul className="grid grid-cols-3 gap-6 sm:grid-cols-6">
          {categories.map((c) => (
            <li key={c.slug} className="flex flex-col items-center gap-3">
              <Link
                href={`/categories/${c.slug}`}
                className="relative h-20 w-20 overflow-hidden rounded-full bg-zinc-100 ring-1 ring-zinc-200 transition-shadow hover:ring-2 hover:ring-zinc-300 dark:bg-zinc-800 dark:ring-zinc-700"
              >
                <Image
                  src={c.image}
                  alt={c.name}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </Link>
              <span className="text-sm font-medium">{c.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
