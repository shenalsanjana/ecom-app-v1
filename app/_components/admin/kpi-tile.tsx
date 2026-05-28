// Presentation tile for admin dashboard stats. Hero variant uses the
// brand olive token; default variant is plain. Server Component — no
// client interactivity needed, so it composes safely under any layout.
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  label: string;
  value: number;
  variant?: "hero" | "default";
};

export function KpiTile({ label, value, variant = "default" }: Props) {
  if (variant === "hero") {
    return (
      <Card className="bg-secondary border-brand/20">
        <CardContent className="p-6">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-5xl font-semibold text-brand">{value}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
