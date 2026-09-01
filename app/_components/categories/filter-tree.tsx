import Link from "next/link";
import { designPath } from "@/app/_lib/taxonomy-path";
import type { DepartmentView } from "@/app/_lib/taxonomy";

type Props = {
  departments: DepartmentView[];
  byDesign: Map<string, number>;
  byDepartment: Map<string, number>;
  totalCount: number;
  selectedDesign: string;
};

const ROW = "block rounded-lg px-4 py-3 text-sm font-medium transition-colors";
const ROW_ACTIVE = "bg-primary text-primary-foreground shadow-lg";
const ROW_IDLE = "bg-background text-muted-foreground hover:bg-accent hover:text-foreground";

/** The browse sidebar: departments, their designs, and how many products sit
 *  under each. Pure — the page does the reading and the arithmetic. */
export function FilterTree({ departments, byDesign, byDepartment, totalCount, selectedDesign }: Props) {
  return (
    <>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Departments
      </h2>
      <ul className="space-y-1">
        <li>
          <Link
            href="/categories"
            data-active={!selectedDesign}
            className={`${ROW} ${!selectedDesign ? ROW_ACTIVE : ROW_IDLE}`}
          >
            <span className="flex items-center justify-between">
              <span>All</span>
              <span className="rounded-full bg-primary-foreground/20 px-2 py-0.5 text-xs font-normal">
                {totalCount}
              </span>
            </span>
          </Link>
        </li>
        {departments.map((d) => {
          // A department is active because the selected design lives under it.
          const deptActive = d.designs.some((g) => g.slug === selectedDesign);
          return (
            <li key={d.slug}>
              <Link
                href={`/categories/${d.slug}`}
                data-active={deptActive}
                className={`${ROW} ${deptActive ? ROW_ACTIVE : ROW_IDLE}`}
              >
                <span className="flex items-center justify-between">
                  <span>{d.name}</span>
                  <span className="rounded-full bg-primary-foreground/10 px-2 py-0.5 text-xs font-normal">
                    {byDepartment.get(d.slug) ?? 0}
                  </span>
                </span>
              </Link>
              {d.designs.length > 0 && (
                <ul className="mt-1 space-y-0.5 pl-4">
                  {d.designs.map((g) => {
                    const active = g.slug === selectedDesign;
                    return (
                      <li key={g.slug}>
                        <Link
                          href={designPath(d.slug, g.slug)}
                          data-active={active}
                          className={`flex items-center justify-between rounded-lg px-4 py-1.5 text-sm transition-colors ${
                            active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          }`}
                        >
                          <span>{g.name}</span>
                          <span className="text-xs text-muted-foreground">{byDesign.get(g.slug) ?? 0}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
