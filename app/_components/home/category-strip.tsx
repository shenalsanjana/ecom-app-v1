import Image from "next/image";
import Link from "next/link";
import { getCategories } from "@/app/_lib/products";
import { Section } from "@/app/_components/ui/section";
import { SectionHeader } from "@/app/_components/ui/section-header";

export async function CategoryStrip() {
  const categories = await getCategories();
  return (
    <Section>
      <SectionHeader title="Shop by category" />
      <ul className="grid grid-cols-2 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
                sizes="(min-width:1024px) 25vw, (min-width:640px) 50vw, 50vw"
                className="object-cover transition-transform duration-(--duration-slow) ease-(--ease-out) group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-4 text-base font-semibold text-white">
                {c.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
