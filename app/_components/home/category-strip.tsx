import Image from "next/image";
import Link from "next/link";
import { getCategories } from "@/app/_lib/products";

export async function CategoryStrip() {
  const categories = await getCategories();
  return (
    <section className="border-b">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="font-heading mb-8 text-2xl font-semibold tracking-tight">Shop by category</h2>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/categories/${c.slug}`}
                className="group relative block aspect-[3/4] overflow-hidden rounded-xl bg-muted"
              >
                <Image
                  src={c.image}
                  alt={c.name}
                  fill
                  sizes="(min-width:1024px) 16vw, (min-width:640px) 33vw, 50vw"
                  className="object-cover transition-transform duration-(--duration-slow) ease-(--ease-out) group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-3 text-sm font-semibold text-white">
                  {c.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
