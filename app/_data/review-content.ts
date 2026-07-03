// Single source of truth for seeded review content, shared by prisma/seed.ts
// (fresh dev seeds) and scripts/update-review-content.ts (live-DB rewrite).
// Pure data + one pure function — no Prisma/Next imports, so it is unit-testable
// and safe to import from a plain tsx script.

export type ReviewTemplate = {
  rating: number; // 1..5
  title: string | null;
  body: string;
};

// Sri Lankan (Sinhala) customer names. First block is the existing pool; the
// second block adds male names so reviews aren't all-female.
export const REVIEW_AUTHORS: string[] = [
  "Nethmi Perera", "Sanuli Fernando", "Tharushi Silva", "Senuri Jayawardena",
  "Dinuli Perera", "Oneli Fernando", "Yehani Silva", "Shenaya Wijesinghe",
  "Kavindi Perera", "Methmi Fernando", "Thevini Silva", "Sayuni Jayasinghe",
  "Himashi Bandara", "Rashmi Perera", "Dinethmi Fernando", "Vihangi Silva",
  "Lithumi Perera", "Senuji Fernando", "Amaaya Silva",
  "Kavindu Perera", "Sahan Fernando", "Dulaj Silva", "Ravindu Jayawardena",
  "Tharindu Bandara", "Nimesh Gunawardena",
];

// Applies to any tee: fit, fabric, delivery, sizing, value, service.
export const SHARED_REVIEWS: ReviewTemplate[] = [
  { rating: 5, title: "Perfect oversized fit", body: "Ordered a Large for that oversized look and it's exactly right. The 220 GSM fabric is thick and soft, doesn't feel cheap at all." },
  { rating: 5, title: "Fast delivery to Colombo", body: "Delivered in 2 days, nicely packed. Paid by card, no issues at all. Very happy with the whole experience." },
  { rating: 4, title: "Good but size up", body: "Material and stitching are great. I'm usually a Medium but this runs a little fitted, so size up if you want it really oversized." },
  { rating: 5, title: null, body: "Washed it a few times already and the print hasn't cracked or faded. Colour still looks new. Worth the price." },
  { rating: 5, title: "Super soft cotton", body: "The fabric feels premium and breathable, perfect for our weather. Will definitely order more colours." },
  { rating: 4, title: "Great value for 2190", body: "Honestly great value for the price. Soft cotton, clean print, comfy fit. Can't complain." },
  { rating: 3, title: "Colour slightly off", body: "Quality is good but the shade came a bit lighter than the photo. Not a dealbreaker, still wear it a lot." },
  { rating: 5, title: "Very happy", body: "Exactly as described. Oversized fit is on point and delivery to Kandy was quick. Recommended!" },
  { rating: 4, title: null, body: "Nice thick material and the fit is comfy. Took about 4 days to arrive but that's fine." },
  { rating: 5, title: "COD was smooth", body: "Ordered with cash on delivery and everything went smoothly. Tee quality is better than I expected." },
  { rating: 2, title: "A bit long for me", body: "Fabric is okay but it was longer than I expected on me. Might work better if you're taller." },
  { rating: 5, title: "Will buy again", body: "Second time ordering from here and the quality is consistent. Soft, well-stitched, prints look great." },
];

// Per-category pools — each template names its own print so the reviews read as
// specific to that design.
export const CATEGORY_REVIEWS: Record<string, ReviewTemplate[]> = {
  cat: [
    { rating: 5, title: "So cute!", body: "The cat print is adorable and came out really crisp. Got the white one and it goes with everything." },
    { rating: 5, title: null, body: "Bought the baby pink cat tee for my sister and she loves it. The design is lovely and the material is super soft." },
    { rating: 4, title: "Cute cat design", body: "Cat print is exactly like the picture. Fit is nice and oversized. Only wish there were more colours." },
    { rating: 5, title: "Love it 🐱", body: "This cat tee is my new favourite. Print quality is excellent and the ivory colour is beautiful." },
    { rating: 5, title: "Purrfect", body: "The cat graphic is so cute and hasn't faded after washing. Comfy oversized fit too." },
    { rating: 4, title: null, body: "Nice cat print and soft fabric. Runs a touch long but I like wearing it oversized anyway." },
    { rating: 3, title: "Cute but thin near print", body: "Love the cat design but the fabric feels slightly thinner around the print area. Still happy overall." },
  ],
  dino: [
    { rating: 5, title: "Love the dino design", body: "The dino print is so fun and the ivory colour is beautiful. Thick fabric, proper oversized fit." },
    { rating: 5, title: null, body: "My son is obsessed with the dino tee. Print quality is excellent and it survived several washes already." },
    { rating: 4, title: "Nice dino tee", body: "Good quality and the dino graphic is sharp. Runs a little long but I like it that way." },
    { rating: 5, title: "Roar 🦖", body: "The dino print is super cute and the material is really soft. Delivery to Colombo was fast too." },
    { rating: 5, title: "Great for kids and adults", body: "Bought matching dino tees for me and my nephew. Both fit great and the print is lovely." },
    { rating: 4, title: null, body: "Dino design is exactly like the photo and the fabric is nice and thick. Happy with it." },
    { rating: 3, title: "Wanted brighter colours", body: "The dino print is cute but I expected the colours to be a bit brighter. Fabric quality is good though." },
  ],
  stitch: [
    { rating: 5, title: "Stitch is the best 💙", body: "The Stitch print is super cute and the colour is exactly as shown. Soft, thick material — very happy!" },
    { rating: 5, title: null, body: "Been wanting a Stitch tee for ages and this one didn't disappoint. Great print, comfy oversized fit, fast delivery." },
    { rating: 4, title: "Cute, ordered a size up", body: "Love the Stitch design and the fabric feels premium. Ordered M and it fits nicely oversized." },
    { rating: 5, title: "Adorable", body: "Stitch design is adorable and the print is really sharp. Got so many compliments already!" },
    { rating: 5, title: null, body: "The Stitch tee is perfect. Colour matches the photo and the material is soft and breathable." },
    { rating: 4, title: "Nice Stitch print", body: "Stitch graphic looks great and quality is solid. Delivery took a few days but worth the wait." },
    { rating: 3, title: "Print smaller than expected", body: "The Stitch print is a little smaller than I thought, but it's cute and the fabric is good quality." },
  ],
};

export function reviewPoolForCategory(slug: string): ReviewTemplate[] {
  return [...SHARED_REVIEWS, ...(CATEGORY_REVIEWS[slug] ?? [])];
}
