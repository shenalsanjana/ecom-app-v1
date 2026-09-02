import { FilterTree } from "@/app/_components/categories/filter-tree";
import { SortSelect } from "@/app/_components/shared/sort-select";
import {
  ApplyFilters,
  FILTER_HEADING,
  InStockField,
  PriceRangeFields,
} from "@/app/_components/shared/filter-fields";
import type { DepartmentView } from "@/app/_lib/taxonomy";

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "name", label: "Name (A–Z)" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "rating", label: "Customer rating" },
];

type Props = {
  departments: DepartmentView[];
  byDesign: Map<string, number>;
  byDepartment: Map<string, number>;
  totalCount: number;
  selectedDesign: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly: boolean;
  sortBy: string;
  /** "All products" with the price and stock filters still applied. */
  allHref: string;
  /** Where to land with every filter dropped. Null hides the reset link. */
  clearHref: string | null;
};

/** The browse rail. Price and stock post a plain GET back to /categories, so
 *  they filter with or without JavaScript — the category rows are links and
 *  navigate on their own, and sort sits outside the form because SortSelect
 *  pushes the URL itself. */
export function FilterRail({
  departments,
  byDesign,
  byDepartment,
  totalCount,
  selectedDesign,
  minPrice,
  maxPrice,
  inStockOnly,
  sortBy,
  allHref,
  clearHref,
}: Props) {
  return (
    <div className="space-y-6">
      <form action="/categories" className="space-y-6">
        {/* Carried so applying a price never silently resets where you are or
            how the list is ordered. Paging restarts by simply not being sent. */}
        {selectedDesign && <input type="hidden" name="category" value={selectedDesign} />}
        {sortBy !== "newest" && <input type="hidden" name="sort" value={sortBy} />}

        <PriceRangeFields minPrice={minPrice} maxPrice={maxPrice} />

        <FilterTree
          departments={departments}
          byDesign={byDesign}
          byDepartment={byDepartment}
          totalCount={totalCount}
          selectedDesign={selectedDesign}
          allHref={allHref}
        />

        <InStockField inStockOnly={inStockOnly} />

        <ApplyFilters clearHref={clearHref} />
      </form>

      <div>
        <h2 className={FILTER_HEADING}>Sort by</h2>
        <SortSelect
          value={sortBy}
          options={SORT_OPTIONS}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
    </div>
  );
}
