import Link from "next/link";

/** The browse-rail furniture, shared by /categories and /search so a filter
 *  looks and behaves the same wherever a shopper meets it. */

export const FILTER_HEADING =
  "mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground";

// A constant left border on every row, transparent until active, so nothing
// shifts sideways when the terracotta rule appears.
export const FILTER_ROW =
  "flex items-center justify-between gap-3 border-l-2 py-2 pl-3 pr-2 text-sm transition-colors duration-(--duration-fast)";
export const FILTER_ROW_ACTIVE =
  "rounded-r-lg border-brand bg-secondary font-medium text-foreground";
export const FILTER_ROW_IDLE =
  "rounded-lg border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground";
export const FILTER_COUNT = "text-xs tabular-nums text-muted-foreground";

const FIELD =
  "w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm tabular-nums placeholder:text-muted-foreground focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function PriceRangeFields({
  minPrice,
  maxPrice,
}: {
  minPrice?: number;
  maxPrice?: number;
}) {
  return (
    <fieldset>
      <legend className={FILTER_HEADING}>Price range</legend>
      <div className="flex items-center gap-2">
        <PriceField name="minPrice" label="Minimum price" placeholder="Min" value={minPrice} />
        <span aria-hidden="true" className="text-muted-foreground">–</span>
        <PriceField name="maxPrice" label="Maximum price" placeholder="Max" value={maxPrice} />
      </div>
    </fieldset>
  );
}

export function InStockField({ inStockOnly }: { inStockOnly: boolean }) {
  return (
    <fieldset>
      <legend className={FILTER_HEADING}>Availability</legend>
      <label className="flex cursor-pointer items-center gap-2.5 py-1 text-sm">
        <input
          type="checkbox"
          name="inStockOnly"
          value="true"
          defaultChecked={inStockOnly}
          className="h-4 w-4 rounded border-input accent-[var(--brand)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <span>In stock only</span>
      </label>
    </fieldset>
  );
}

/** Submits the rail. `clearHref` is null while nothing is filtered — there is
 *  then nothing to clear, and offering it would be a dead control. */
export function ApplyFilters({ clearHref }: { clearHref: string | null }) {
  return (
    <div className="flex items-center gap-4">
      <button
        type="submit"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-(--duration-fast) hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Apply filters
      </button>
      {clearHref && (
        <Link
          href={clearHref}
          className="text-sm text-muted-foreground underline-offset-4 transition-colors duration-(--duration-fast) hover:text-brand hover:underline"
        >
          Clear all
        </Link>
      )}
    </div>
  );
}

/** A price box that says which currency it is asking for. */
function PriceField({
  name,
  label,
  placeholder,
  value,
}: {
  name: string;
  label: string;
  placeholder: string;
  value?: number;
}) {
  return (
    <div className="relative flex-1">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
      >
        Rs
      </span>
      <input
        type="number"
        inputMode="numeric"
        name={name}
        min={0}
        step={1}
        aria-label={`${label} in rupees`}
        placeholder={placeholder}
        defaultValue={value ?? ""}
        className={FIELD}
      />
    </div>
  );
}
