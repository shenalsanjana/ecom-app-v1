import { cn } from "@/lib/utils";
import { Eyebrow } from "./eyebrow";
import { TextLink } from "./text-link";

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  action?: { label: string; href: string };
  className?: string;
};

export function SectionHeader({
  eyebrow,
  title,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("mb-10 flex items-end justify-between gap-4", className)}>
      <div>
        {eyebrow && <Eyebrow className="mb-1">{eyebrow}</Eyebrow>}
        <h2 className="font-heading text-2xl font-semibold tracking-tight">
          {title}
        </h2>
      </div>
      {action && <TextLink href={action.href}>{action.label}</TextLink>}
    </div>
  );
}
