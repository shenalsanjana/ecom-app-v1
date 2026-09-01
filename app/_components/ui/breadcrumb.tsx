import { Fragment } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Crumb } from "@/app/_lib/taxonomy-trail";

/** The one breadcrumb on the site. `aria-current` marks the last crumb only:
 *  an unlinked middle crumb (the sub-category) is context, not your location. */
export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("text-sm text-muted-foreground", className)}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((crumb, i) => {
          const isLast = i === items.length - 1;
          return (
            <Fragment key={`${crumb.label}-${i}`}>
              {i > 0 && (
                <li aria-hidden="true">
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </li>
              )}
              <li
                {...(isLast ? { "aria-current": "page" as const } : {})}
                className={isLast ? "font-medium text-foreground line-clamp-1" : undefined}
              >
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="underline-offset-4 transition-colors duration-(--duration-fast) hover:text-brand hover:underline"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  crumb.label
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
