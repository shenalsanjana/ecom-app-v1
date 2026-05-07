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
  { slug: "cat", name: "Cat", image: "/products/cat-white/main.jpg" },
  { slug: "dino", name: "Dino", image: "/products/dino-white/main.jpg" },
];

export const featuredProducts: Product[] = [
  { id: "cat-white",       name: "Oversize Cat T-Shirt — White",      price: 2190, image: "/products/cat-white/main.jpg",       rating: 0, reviewCount: 0, category: "cat" },
  { id: "cat-ivory",       name: "Oversize Cat T-Shirt — Ivory",      price: 2190, image: "/products/cat-ivory/main.jpg",       rating: 0, reviewCount: 0, category: "cat" },
  { id: "cat-baby-pink",   name: "Oversize Cat T-Shirt — Baby Pink",  price: 2190, image: "/products/cat-baby-pink/main.jpg",   rating: 0, reviewCount: 0, category: "cat" },
  { id: "dino-white",      name: "Oversize Dino T-Shirt — White",     price: 2190, image: "/products/dino-white/main.jpg",      rating: 0, reviewCount: 0, category: "dino" },
  { id: "dino-ivory",      name: "Oversize Dino T-Shirt — Ivory",     price: 2190, image: "/products/dino-ivory/main.jpg",      rating: 0, reviewCount: 0, category: "dino" },
  { id: "dino-baby-pink",  name: "Oversize Dino T-Shirt — Baby Pink", price: 2190, image: "/products/dino-baby-pink/main.jpg",  rating: 0, reviewCount: 0, category: "dino" },
];

export const dealsProducts: Product[] = [];
