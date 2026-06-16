"use client";

import * as React from "react";
import { ChevronsUpDown, Check, Search } from "lucide-react";

import { cn } from "@/lib/utils";

export type CityGroup = { district: string; cities: string[] };

type FlatCity = { city: string; district: string };

type Props = {
  id?: string;
  name?: string;
  value: string;
  onChange: (city: string) => void;
  groups: CityGroup[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Max options rendered at once. Defaults to Infinity (render all, scrollable). */
  limit?: number;
};

/**
 * Searchable, district-grouped city picker for the large Curfox catalogue.
 * Controlled by the city NAME string (what checkout submits and what booking
 * resolves against). Falls back to keyboard + pointer selection with basic
 * ARIA combobox semantics.
 */
export function CityCombobox({
  id,
  name = "city",
  value,
  onChange,
  groups,
  placeholder = "Search your city…",
  required,
  disabled,
  // Render the whole catalogue by default so customers can scroll/browse all
  // cities; typing still narrows. Pass a number to cap for perf if needed.
  limit = Infinity,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listboxId = `${id ?? name}-listbox`;

  const flat = React.useMemo<FlatCity[]>(
    () => groups.flatMap((g) => g.cities.map((city) => ({ city, district: g.district }))),
    [groups],
  );

  const filtered = React.useMemo<FlatCity[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter(
      (f) => f.city.toLowerCase().includes(q) || f.district.toLowerCase().includes(q),
    );
  }, [flat, query]);

  const shown = React.useMemo(() => {
    const slice = filtered.slice(0, limit);
    return slice.map((f, idx) => ({
      ...f,
      idx,
      showHeader: idx === 0 || slice[idx - 1].district !== f.district,
    }));
  }, [filtered, limit]);
  const truncated = filtered.length - shown.length;

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Keep the active option in view.
  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function openMenu() {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setActive(0);
  }

  function commit(city: string) {
    onChange(city);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      e.preventDefault();
      openMenu();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = shown[active];
      if (pick) commit(pick.city);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  // What the text field displays: the live query while typing, otherwise the
  // committed value.
  const displayValue = open ? query : value;

  return (
    <div ref={rootRef} className="relative">
      {/* Hidden mirror so native form semantics / autofill see the city. */}
      <input type="hidden" name={name} value={value} />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
          required={required && !value ? true : undefined}
          disabled={disabled}
          value={displayValue}
          placeholder={value ? value : placeholder}
          onFocus={openMenu}
          onClick={openMenu}
          onChange={(e) => {
            setOpen(true);
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-9 py-2 text-sm outline-none transition-colors",
            "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "disabled:pointer-events-none disabled:opacity-50",
            !value && !open && "text-muted-foreground",
          )}
        />
        <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-input bg-popover p-1 shadow-md"
        >
          {shown.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matching city. Try a different spelling.
            </li>
          )}
          {shown.map((f) => {
            const idx = f.idx;
            const header = f.showHeader ? f.district : null;
            const isActive = idx === active;
            const isSelected = f.city === value;
            return (
              <React.Fragment key={`${f.district}:${f.city}`}>
                {header && (
                  <li
                    aria-hidden
                    className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {header}
                  </li>
                )}
                <li
                  role="option"
                  aria-selected={isSelected}
                  data-idx={idx}
                  onMouseEnter={() => setActive(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(f.city);
                  }}
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm",
                    isActive && "bg-accent text-accent-foreground",
                  )}
                >
                  <span>{f.city}</span>
                  {isSelected && <Check className="size-4 text-primary" />}
                </li>
              </React.Fragment>
            );
          })}
          {truncated > 0 && (
            <li className="px-3 py-2 text-center text-xs text-muted-foreground">
              +{truncated} more — keep typing to narrow
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
