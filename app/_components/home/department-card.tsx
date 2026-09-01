// app/_components/home/department-card.tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SlideShow, type Slide } from "@/app/_components/ui/slide-show";

export function DepartmentCard({
  href, name, note, slides,
}: {
  href: string; name: string; note: string; slides: Slide[];
}) {
  return (
    <Link
      href={href}
      className="flex flex-col overflow-hidden rounded-2xl bg-card transition-[transform,box-shadow] duration-(--duration-base) ease-(--ease-out) motion-safe:hover:-translate-y-[3px] hover:shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      style={{ boxShadow: "0 0 0 1px color-mix(in oklab, var(--fg) 6%, transparent)" }}
    >
      <div className="relative aspect-square overflow-hidden">
        <SlideShow slides={slides} dots="bottom-right" fadeMs={700} subject={name} />
      </div>
      <div className="flex items-center justify-between gap-2.5 px-[18px] pb-[18px] pt-4">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="font-heading text-[21px] font-bold leading-[1.1] tracking-[-0.015em] text-balance">
            {name}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">
            {note}
          </span>
        </div>
        <ArrowRight className="h-[19px] w-[19px] shrink-0 text-brand" aria-hidden />
      </div>
    </Link>
  );
}
