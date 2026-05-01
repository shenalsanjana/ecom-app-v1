"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

type Option = { value: string; label: string };

type Props = {
  value: string;
  options: Option[];
  paramName?: string;
  className?: string;
  ariaLabel?: string;
};

export function SortSelect({
  value,
  options,
  paramName = "sort",
  className,
  ariaLabel = "Sort",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, e.target.value);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      aria-label={ariaLabel}
      className={className}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
