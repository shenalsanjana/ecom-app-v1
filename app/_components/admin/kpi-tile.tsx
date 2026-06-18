// Presentation tile for admin dashboard stats. Hero variant uses the brand
// olive token; default variant is plain. Pass `href` to make the whole tile a
// link (e.g. deep-link into a filtered orders view). Server Component — no
// client interactivity needed, so it composes safely under any layout.
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  label: string;
  value: number;
  variant?: "hero" | "default";
  href?: string;
};

export function KpiTile({ label, value, variant = "default", href }: Props) {
  const isHero = variant === "hero";
  const card = (
    <Card className={isHero ? "h-full bg-secondary border-brand/20" : "h-full"}>
      <CardContent className={isHero ? "p-6" : "p-4"}>
        <p className={`uppercase tracking-wide text-muted-foreground ${isHero ? "text-sm" : "text-xs"}`}>{label}</p>
        <p className={`mt-2 font-semibold ${isHero ? "text-5xl text-brand" : "text-2xl"}`}>{value}</p>
      </CardContent>
    </Card>
  );

  if (!href) return card;

  return (
    <Link
      href={href}
      aria-label={`${label}: ${value} — view these orders`}
      className="block h-full rounded-xl transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {card}
    </Link>
  );
}
