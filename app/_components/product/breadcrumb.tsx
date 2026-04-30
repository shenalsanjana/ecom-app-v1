import Link from "next/link";
import { ChevronRight } from "lucide-react";

type Props = {
  categorySlug: string;
  categoryName: string;
  productName: string;
};

export function Breadcrumb({ categorySlug, categoryName, productName }: Props) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link href="/" className="hover:text-foreground">Home</Link>
        </li>
        <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
        <li>
          <Link
            href={`/?category=${categorySlug}`}
            className="hover:text-foreground"
          >
            {categoryName}
          </Link>
        </li>
        <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
        <li aria-current="page" className="text-foreground line-clamp-1">{productName}</li>
      </ol>
    </nav>
  );
}
