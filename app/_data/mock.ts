export type Category = {
  slug: string;
  name: string;
  image: string;
};

export type Product = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  rating: number;
  reviewCount: number;
  category: Category["slug"];
};

export const categories: Category[] = [
  { slug: "oversize-tshirts", name: "Oversize T-Shirts", image: "/window.svg" },
  { slug: "graphic-tees", name: "Graphic Tees", image: "/file.svg" },
  { slug: "solid-basics", name: "Solid Basics", image: "/globe.svg" },
];

export const featuredProducts: Product[] = [
  { id: "p1", name: "Classic Black Oversize T-Shirt", price: 1850, image: "/window.svg", rating: 4.7, reviewCount: 324, category: "oversize-tshirts" },
  { id: "p2", name: "Vintage Wash Oversize Tee - Navy", price: 2100, image: "/file.svg", rating: 4.8, reviewCount: 256, category: "oversize-tshirts" },
  { id: "p3", name: "Striped Oversize T-Shirt - White/Black", price: 1950, image: "/globe.svg", rating: 4.5, reviewCount: 189, category: "oversize-tshirts" },
  { id: "p4", name: "Drops Shoulder Oversize - Heather Grey", price: 1750, originalPrice: 2200, image: "/vercel.svg", rating: 4.6, reviewCount: 412, category: "oversize-tshirts" },
  { id: "p5", name: "Urban Street Oversize Tee - Black", price: 2350, originalPrice: 2800, image: "/next.svg", rating: 4.9, reviewCount: 567, category: "graphic-tees" },
  { id: "p6", name: "Minimal Logo Oversize - White", price: 1650, image: "/file.svg", rating: 4.4, reviewCount: 198, category: "solid-basics" },
  { id: "p7", name: "Acid Wash Oversize Tee - Slate", price: 2050, image: "/window.svg", rating: 4.7, reviewCount: 145, category: "oversize-tshirts" },
  { id: "p8", name: "Relaxed Fit Oversize - Charcoal", price: 1850, originalPrice: 2400, image: "/globe.svg", rating: 4.6, reviewCount: 289, category: "oversize-tshirts" },
];

export const dealsProducts: Product[] = [
  { id: "d1", name: "Washed Finish Oversize Tee - Olive", price: 1650, originalPrice: 2200, image: "/window.svg", rating: 4.5, reviewCount: 178, category: "oversize-tshirts" },
  { id: "d2", name: "Boxy Fit Oversize - Dusty Pink", price: 1550, originalPrice: 1990, image: "/file.svg", rating: 4.8, reviewCount: 234, category: "oversize-tshirts" },
  { id: "d3", name: "Heavyweight Cotton Oversize - Stone", price: 2450, originalPrice: 3200, image: "/globe.svg", rating: 4.9, reviewCount: 156, category: "oversize-tshirts" },
  { id: "d4", name: "Tie-Dye Pattern Oversize - Multi", price: 1950, originalPrice: 2500, image: "/next.svg", rating: 4.4, reviewCount: 312, category: "graphic-tees" },
];
