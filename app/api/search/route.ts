import { NextRequest, NextResponse } from 'next/server';
import { searchProducts, getProducts, parseSortBy, type GetProductsOptions } from '@/app/_lib/products';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get('q');
  const designSlug = searchParams.get('category');
  const designSlugs = searchParams.get('categories')?.split(',').filter(Boolean);
  const sortBy = parseSortBy(searchParams.get('sort') ?? undefined, 'newest');
  const minPrice = searchParams.get('minPrice')
    ? parseFloat(searchParams.get('minPrice')!)
    : undefined;
  const maxPrice = searchParams.get('maxPrice')
    ? parseFloat(searchParams.get('maxPrice')!)
    : undefined;
  const inStockOnly = searchParams.get('inStockOnly') === 'true';
  const limit = searchParams.get('limit')
    ? parseInt(searchParams.get('limit')!, 10)
    : undefined;

  try {
    if (q && q.trim()) {
      const results = await searchProducts(q.trim(), limit || 50);
      return NextResponse.json({ results, query: q.trim() });
    }

    const opts: GetProductsOptions = {
      sortBy,
      inStockOnly,
      minPrice,
      maxPrice,
    };
    if (designSlug) opts.designSlug = designSlug;
    if (designSlugs && designSlugs.length > 0) opts.designSlugs = designSlugs;

    const results = await getProducts(opts);
    if (limit && limit > 0) {
      results.splice(limit);
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: 'Failed to search products' },
      { status: 500 }
    );
  }
}
