export type Category = {
  slug: string;
  name: string;
  image: string;
};

export type MockSize = { size: string; stock?: number };

export type MockVariant = {
  color: string;
  colorSlug: string;
  swatchHex?: string;
  sku?: string;
  price?: number;        // optional override; default is the product base price
  originalPrice?: number;
  sizes: MockSize[];     // stock omitted => deterministic seed default
};

export type MockProduct = {
  id: string;            // product-level slug/id, color-free
  name: string;          // color-free design name
  price: number;
  originalPrice?: number;
  category: string;
  variants: MockVariant[];
};

const STD_SIZES: MockSize[] = [{ size: "S" }, { size: "M" }, { size: "L" }, { size: "XL" }];

export const categories: Category[] = [
  { slug: "cat", name: "Cat", image: "/products/cat/white/card/1.jpg" },
  { slug: "dino", name: "Dino", image: "/products/dino/white/card/1.jpg" },
];

const COLORS: { color: string; colorSlug: string; swatchHex: string }[] = [
  { color: "White", colorSlug: "white", swatchHex: "#FFFFFF" },
  { color: "Ivory", colorSlug: "ivory", swatchHex: "#FFFFF0" },
  { color: "Baby Pink", colorSlug: "baby-pink", swatchHex: "#F4C2C2" },
];

function variantsFor(productId: string): MockVariant[] {
  return COLORS.map((c) => ({
    color: c.color,
    colorSlug: c.colorSlug,
    swatchHex: c.swatchHex,
    sku: `${productId}-${c.colorSlug}`.toUpperCase(),
    sizes: STD_SIZES,
  }));
}

export const catalogProducts: MockProduct[] = [
  { id: "oversize-cat-tshirt",  name: "Oversize Cat T-Shirt",  price: 2190, category: "cat",  variants: variantsFor("oversize-cat-tshirt") },
  { id: "oversize-dino-tshirt", name: "Oversize Dino T-Shirt", price: 2190, category: "dino", variants: variantsFor("oversize-dino-tshirt") },
];
