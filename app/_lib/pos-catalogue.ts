import type { PosProduct } from "./pos";

export type PosProductGroup = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  options: PosProduct[];
};

export function groupPosProducts(options: PosProduct[]): PosProductGroup[] {
  const products = new Map<string, PosProductGroup>();
  for (const option of options) {
    const product = products.get(option.productId);
    if (product) product.options.push(option);
    else products.set(option.productId, { id: option.productId, name: option.name,
      categoryId: option.categoryId, categoryName: option.categoryName, options: [option] });
  }
  return [...products.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function matchesPosSearch(product: PosProductGroup, query: string): boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return product.options.some(option => {
    const text = [product.name, product.categoryName, option.sku, option.color, option.size].join(" ").toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}
