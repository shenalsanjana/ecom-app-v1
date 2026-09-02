import Link from "next/link";
import { designPath } from "@/app/_lib/taxonomy-path";
import type { DepartmentView } from "@/app/_lib/taxonomy";
import {
  FILTER_COUNT,
  FILTER_HEADING,
  FILTER_ROW,
  FILTER_ROW_ACTIVE,
  FILTER_ROW_IDLE,
} from "@/app/_components/shared/filter-fields";

type Props = {
  departments: DepartmentView[];
  byDesign: Map<string, number>;
  byDepartment: Map<string, number>;
  totalCount: number;
  selectedDesign: string;
  /** Where "All products" points, carrying the price and stock filters that
   *  are in force. Defaults to the bare browse page. */
  allHref?: string;
};

const ROW = FILTER_ROW;
const ROW_ACTIVE = FILTER_ROW_ACTIVE;
const ROW_IDLE = FILTER_ROW_IDLE;
const COUNT = FILTER_COUNT;

/** The category list: departments, how many products sit under each, and — for
 *  the department you are in — its designs. Pure; the page does the reading and
 *  the arithmetic.
 *
 *  Designs stay folded away until their department is the one selected. All of
 *  them at once turned the rail into a wall of rows, and every design is one
 *  hover away in the header nav. */
export function FilterTree({
  departments,
  byDesign,
  byDepartment,
  totalCount,
  selectedDesign,
  allHref = "/categories",
}: Props) {
  return (
    <div>
      <h2 className={FILTER_HEADING}>Categories</h2>
      <ul>
        <li>
          <Link
            href={allHref}
            data-active={!selectedDesign}
            className={`${ROW} ${!selectedDesign ? ROW_ACTIVE : ROW_IDLE}`}
          >
            <span>All products</span>
            <span className={COUNT}>{totalCount}</span>
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
                <span>{d.name}</span>
                <span className={COUNT}>{byDepartment.get(d.slug) ?? 0}</span>
              </Link>
              {deptActive && d.designs.length > 0 && (
                <ul className="ml-3 border-l pl-1">
                  {d.designs.map((g) => {
                    const active = g.slug === selectedDesign;
                    return (
                      <li key={g.slug}>
                        <Link
                          href={designPath(d.slug, g.slug)}
                          data-active={active}
                          className={`flex items-center justify-between gap-3 rounded-lg py-1.5 pl-3 pr-2 text-sm transition-colors duration-(--duration-fast) ${
                            active
                              ? "font-medium text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <span>{g.name}</span>
                          <span className={COUNT}>{byDesign.get(g.slug) ?? 0}</span>
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
    </div>
  );
}
