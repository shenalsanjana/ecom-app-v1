import Link from "next/link";
import { getCategories } from "@/app/_lib/products";
import { tintForSlug, inkFor } from "@/app/_lib/category-tint";
import { Section } from "@/app/_components/ui/section";
import { SectionHeader } from "@/app/_components/ui/section-header";

export async function CategoryStrip() {
  const categories = await getCategories();
  return (
    <Section>
      <SectionHeader title="Shop by category" />
      <ul className="grid grid-cols-2 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((c) => {
          const tint = tintForSlug(c.slug);
          const ink = inkFor(tint);
          return (
            <li key={c.slug}>
              <Link
                href={`/categories/${c.slug}`}
                className="flex aspect-[3/4] flex-col items-center justify-center gap-2 overflow-hidden rounded-xl px-4 text-center transition-transform duration-(--duration-base) ease-(--ease-out) motion-safe:hover:-translate-y-[3px]"
                style={{ backgroundColor: tint, color: ink }}
              >
                <span className="font-heading text-[28px] font-bold leading-tight">
                  {c.name}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
                  Shop {c.name} →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
