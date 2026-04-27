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
  { slug: "electronics", name: "Electronics", image: "/window.svg" },
  { slug: "fashion", name: "Fashion", image: "/file.svg" },
  { slug: "home", name: "Home", image: "/globe.svg" },
  { slug: "beauty", name: "Beauty", image: "/vercel.svg" },
  { slug: "sports", name: "Sports", image: "/next.svg" },
  { slug: "books", name: "Books", image: "/file.svg" },
];

export const featuredProducts: Product[] = [
  { id: "p1", name: "Wireless Noise-Cancelling Headphones", price: 249.99, image: "/window.svg", rating: 4.6, reviewCount: 1284, category: "electronics" },
  { id: "p2", name: "Minimalist Leather Wallet", price: 39.0, image: "/file.svg", rating: 4.8, reviewCount: 642, category: "fashion" },
  { id: "p3", name: "Ceramic Pour-Over Coffee Set", price: 64.5, image: "/globe.svg", rating: 4.4, reviewCount: 318, category: "home" },
  { id: "p4", name: "Hydrating Vitamin C Serum", price: 28.0, image: "/vercel.svg", rating: 4.7, reviewCount: 2104, category: "beauty" },
  { id: "p5", name: "Trail Running Shoes", price: 129.99, originalPrice: 159.99, image: "/next.svg", rating: 4.5, reviewCount: 887, category: "sports" },
  { id: "p6", name: "The Pragmatic Programmer", price: 34.0, image: "/file.svg", rating: 4.9, reviewCount: 5421, category: "books" },
  { id: "p7", name: "Smart Fitness Watch", price: 199.0, image: "/window.svg", rating: 4.3, reviewCount: 712, category: "electronics" },
  { id: "p8", name: "Linen Throw Blanket", price: 89.0, image: "/globe.svg", rating: 4.6, reviewCount: 254, category: "home" },
];

export const dealsProducts: Product[] = [
  { id: "d1", name: "Bluetooth Portable Speaker", price: 69.99, originalPrice: 99.99, image: "/window.svg", rating: 4.4, reviewCount: 1820, category: "electronics" },
  { id: "d2", name: "Cotton Crewneck Sweatshirt", price: 34.99, originalPrice: 59.99, image: "/file.svg", rating: 4.5, reviewCount: 410, category: "fashion" },
  { id: "d3", name: "Stainless Steel Cookware Set", price: 179.0, originalPrice: 259.0, image: "/globe.svg", rating: 4.7, reviewCount: 333, category: "home" },
  { id: "d4", name: "Yoga Mat Premium", price: 29.5, originalPrice: 49.0, image: "/next.svg", rating: 4.6, reviewCount: 1011, category: "sports" },
];
