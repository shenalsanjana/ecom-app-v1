import Link from "next/link";
import { ChevronRight } from "lucide-react";

type Props = {
  designSlug: string;
  designName: string;
  productName: string;
};

export function Breadcrumb({ designSlug, designName, productName }: Props) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link
            href="/"
            className="underline-offset-4 transition-colors duration-(--duration-fast) hover:text-brand hover:underline"
          >
            Home
          </Link>
        </li>
        <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></li>
        <li>
          <Link
            href={`/?category=${designSlug}`}
            className="underline-offset-4 transition-colors duration-(--duration-fast) hover:text-brand hover:underline"
          >
            {designName}
          </Link>
        </li>
        <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></li>
        <li aria-current="page" className="font-medium text-foreground line-clamp-1">{productName}</li>
      </ol>
    </nav>
  );
}
