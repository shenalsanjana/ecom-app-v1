// Single source of truth for seeded review content, shared by prisma/seed.ts
// (fresh dev seeds) and scripts/update-review-content.ts (live-DB rewrite).
// Pure data + one pure function — no Prisma/Next imports, so it is unit-testable
// and safe to import from a plain tsx script.

export type ReviewTemplate = {
  rating: number; // 1..5
  title: string | null;
  body: string;
};

// Sri Lankan customer names. First two blocks are the existing Sinhala pool
// (female, then male); the third and fourth blocks add Tamil and Moor names
// so the pool reflects Sri Lanka's actual customer mix rather than reading
// as single-community.
export const REVIEW_AUTHORS: string[] = [
  "Nethmi Perera", "Sanuli Fernando", "Tharushi Silva", "Senuri Jayawardena",
  "Dinuli Perera", "Oneli Fernando", "Yehani Silva", "Shenaya Wijesinghe",
  "Kavindi Perera", "Methmi Fernando", "Thevini Silva", "Sayuni Jayasinghe",
  "Himashi Bandara", "Rashmi Perera", "Dinethmi Fernando", "Vihangi Silva",
  "Lithumi Perera", "Senuji Fernando", "Amaaya Silva",
  "Kavindu Perera", "Sahan Fernando", "Dulaj Silva", "Ravindu Jayawardena",
  "Tharindu Bandara", "Nimesh Gunawardena",
  "Ashen Rathnayake", "Chamodi Wickramasinghe", "Isuru Kodithuwakku",
  "Nadeesha Rajapaksa", "Chathumi Herath", "Malsha Weerasinghe",
  "Ruwanthi Dissanayake", "Buddhika Ekanayake", "Chanaka Amarasinghe",
  "Priya Rajendran", "Nirosha Kumaraswamy", "Kavya Sivakumar",
  "Dinesh Thillainathan", "Arun Ganeshan", "Vishaka Nadarajah",
  "Fathima Rizvi", "Ahamed Nazeer", "Shifa Mohideen", "Ismail Hakeem",
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
  { rating: 5, title: "Confirmed on WhatsApp fast", body: "They confirmed my order on WhatsApp within the hour and it arrived in Galle 3 days later, well packed in a poly mailer. No complaints." },
  { rating: 4, title: "Exchanged size, no hassle", body: "Ordered a Small by mistake and they exchanged it for a Medium without any drama. Tee itself is thick and comfy, exactly as pictured." },
  { rating: 5, title: null, body: "Bought this as a gift and it came nicely folded, looked presentable straight out of the packaging. Recipient loved it." },
  { rating: 5, title: "Third order and counting", body: "This is my third tee from Dressing Bear now, all bought with COD. Quality never drops, always true to size." },
  { rating: 4, title: "Bank transfer went smoothly", body: "Paid via bank transfer and they shipped the same day once confirmed. Fabric is thick, print looks premium, happy with it." },
  { rating: 3, title: "Neckline a little loose", body: "Everything else is great but the neckline stretched slightly after the first wash. Still wearable, just something to note." },
  { rating: 5, title: "Delivered to Jaffna, no issues", body: "Wasn't sure delivery would reach Jaffna quickly but it came in about 5 days, well packed. Fabric quality is genuinely good for the price." },
  { rating: 5, title: "Kids size fits true", body: "Ordered a smaller size for my daughter and it fits exactly as the size chart said. Soft fabric, hasn't shrunk after washing." },
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
    { rating: 5, title: "Cat lovers, get this", body: "As someone with three cats at home this tee was a must-buy. Print is sharp and the fabric holds up well after washing." },
    { rating: 4, title: null, body: "Cat graphic is well placed and doesn't crack. Ordered a Medium and it drapes nicely for the oversized look." },
    { rating: 5, title: "Got compliments on the cat print", body: "Wore this out and got asked twice where I bought it. The cat design is clean and the material feels premium." },
  ],
  dino: [
    { rating: 5, title: "Love the dino design", body: "The dino print is so fun and the ivory colour is beautiful. Thick fabric, proper oversized fit." },
    { rating: 5, title: null, body: "My son is obsessed with the dino tee. Print quality is excellent and it survived several washes already." },
    { rating: 4, title: "Nice dino tee", body: "Good quality and the dino graphic is sharp. Runs a little long but I like it that way." },
    { rating: 5, title: "Roar 🦖", body: "The dino print is super cute and the material is really soft. Delivery to Colombo was fast too." },
    { rating: 5, title: "Great for kids and adults", body: "Bought matching dino tees for me and my nephew. Both fit great and the print is lovely." },
    { rating: 4, title: null, body: "Dino design is exactly like the photo and the fabric is nice and thick. Happy with it." },
    { rating: 3, title: "Wanted brighter colours", body: "The dino print is cute but I expected the colours to be a bit brighter. Fabric quality is good though." },
    { rating: 5, title: "Perfect birthday gift", body: "Got this dino tee for my nephew's birthday and he wore it the same day. Print is clean and the fabric feels durable." },
    { rating: 4, title: null, body: "Dino tee held up well through several washes, no cracking on the print. Fits true to the size chart." },
    { rating: 5, title: "Fun and comfy", body: "The dino graphic is playful without being childish, works for adults too. Soft cotton and a proper oversized cut." },
  ],
  stitch: [
    { rating: 5, title: "Stitch is the best 💙", body: "The Stitch print is super cute and the colour is exactly as shown. Soft, thick material — very happy!" },
    { rating: 5, title: null, body: "Been wanting a Stitch tee for ages and this one didn't disappoint. Great print, comfy oversized fit, fast delivery." },
    { rating: 4, title: "Cute, ordered a size up", body: "Love the Stitch design and the fabric feels premium. Ordered M and it fits nicely oversized." },
    { rating: 5, title: "Adorable", body: "Stitch design is adorable and the print is really sharp. Got so many compliments already!" },
    { rating: 5, title: null, body: "The Stitch tee is perfect. Colour matches the photo and the material is soft and breathable." },
    { rating: 4, title: "Nice Stitch print", body: "Stitch graphic looks great and quality is solid. Delivery took a few days but worth the wait." },
    { rating: 3, title: "Print smaller than expected", body: "The Stitch print is a little smaller than I thought, but it's cute and the fabric is good quality." },
    { rating: 5, title: "My daughter's favourite", body: "Bought the Stitch tee for my daughter and it's now on repeat every week. Print is holding up fine after multiple washes." },
    { rating: 4, title: null, body: "Stitch print is bright and well centred. Fabric is thick enough that it doesn't feel like a cheap cartoon tee." },
    { rating: 5, title: "Better than expected", body: "Wasn't expecting much for the price but the Stitch tee exceeded expectations. Great fabric, accurate colours, fast delivery." },
  ],
  bear: [
    { rating: 5, title: "So cute! 🐻", body: "The bear print is adorable and matches the Dressing Bear logo vibe perfectly. Fabric feels thick, not see-through at all." },
    { rating: 5, title: null, body: "Got the bear tee as a gift for my niece and she wouldn't take it off. Print is soft to touch and hasn't cracked after a few washes." },
    { rating: 4, title: "Cute bear design", body: "Bear print is exactly like the picture and the oversized fit is perfect. Only wish there were more colour options." },
    { rating: 5, title: "Love it", body: "This bear tee is easily my favourite from Dressing Bear. Print quality is excellent and the fabric is nice and thick." },
    { rating: 4, title: null, body: "Nice bear graphic and soft cotton. Runs a bit long on me but I like the oversized look anyway." },
    { rating: 3, title: "Cute but print peeled slightly", body: "The bear design is lovely but I noticed a tiny bit of peeling near the edge of the print after washing. Still wearable and comfy." },
    { rating: 5, title: "Matches the brand", body: "Bought this because the bear print matches the brand name and it did not disappoint — soft, thick fabric and fast delivery to Colombo." },
    { rating: 4, title: null, body: "Bear tee is comfy and the print hasn't cracked yet after several washes. Runs slightly long but suits the oversized style." },
    { rating: 5, title: "Great everyday tee", body: "The bear print is subtle enough to wear anywhere and the fabric is genuinely thick, not the thin stuff you usually get at this price." },
    { rating: 4, title: "Bear print holds up", body: "Been wearing this bear tee weekly for a month and the print still looks new. Fit is true to size for a Medium." },
  ],
  dog: [
    { rating: 5, title: "Dog lovers will love this 🐶", body: "The dog print is adorable and the oversized fit is exactly what I wanted. Fabric feels thick and premium." },
    { rating: 5, title: null, body: "Bought the dog tee for my brother who has two golden retrievers, he loves it. Print is crisp and the material is soft." },
    { rating: 4, title: "Nice dog design", body: "Dog print looks exactly like the photo and the fit is comfy oversized. Wish there were more colourways." },
    { rating: 4, title: null, body: "Good quality dog tee, soft fabric and the print hasn't faded after a few washes. Delivery to Kandy took about 4 days." },
    { rating: 5, title: "Great gift", body: "Got this dog print tee as a birthday gift and it was a hit. Thick 220 GSM fabric, true to size." },
    { rating: 3, title: "Runs a bit long", body: "The dog design is cute but the tee runs a bit long on me. Fabric quality is good though, no complaints there." },
    { rating: 2, title: "Print smaller than expected", body: "Dog print is nice but smaller than I expected from the photos. Fabric and stitching are fine, just wanted a bigger graphic." },
    { rating: 5, title: "Every dog person needs this", body: "The dog tee is a great conversation starter at the park. Fabric feels sturdy and the oversized fit is exactly right." },
    { rating: 4, title: null, body: "Dog print tee washed well, no fading so far. A little roomy but that's the oversized cut working as intended." },
    { rating: 5, title: "Matching tees for the family", body: "Ordered three dog print tees for the family and all arrived together, well packed. Print quality is consistent across all three." },
  ],
  feathers: [
    { rating: 5, title: "Boho feathers design 🪶", body: "The feathers print is so elegant and the oversized fit drapes really nicely. Fabric is thick and soft." },
    { rating: 5, title: null, body: "Loved the feathers tee the moment it arrived. Print is detailed and hasn't faded even after several washes." },
    { rating: 4, title: "Pretty feathers print", body: "The feathers design is lovely and true to the photo. Runs a little long but that's fine for the oversized look." },
    { rating: 5, title: "Unique design", body: "Don't see feathers prints like this often — soft cotton, breathable, and the print quality is excellent." },
    { rating: 4, title: null, body: "Nice feathers graphic and comfy fit. Took about 3 days to deliver to Colombo, no issues with COD." },
    { rating: 3, title: "Wanted brighter colours", body: "The feathers print is pretty but I expected the colours to pop a bit more. Fabric and fit are still good." },
    { rating: 5, title: "So elegant", body: "This feathers tee gets compliments every time I wear it. Thick 220 GSM material, true to size." },
    { rating: 4, title: null, body: "Feathers print is delicate looking but printed well, no cracking so far. Fabric drapes nicely for the oversized fit." },
    { rating: 5, title: "Different from usual prints", body: "Tired of the usual cartoon tees so the feathers design was a nice change. Quality is on par with the rest of the range." },
    { rating: 4, title: "Feathers design ages well", body: "Had this feathers tee for a couple months now, print hasn't faded and the fabric still feels thick." },
  ],
  heart: [
    { rating: 5, title: "Sweet heart design", body: "The heart print is simple and cute, goes with everything. Fabric feels thick and premium, not see-through." },
    { rating: 5, title: null, body: "Bought the heart tee for my girlfriend and she loves it. Print is clean and the material is super soft." },
    { rating: 4, title: "Cute heart graphic", body: "Heart print is exactly like the picture and the fit is comfortably oversized. Only wish there were more colours." },
    { rating: 5, title: "Love it", body: "This heart tee is adorable and the print quality is excellent, hasn't faded after several washes." },
    { rating: 4, title: null, body: "Nice heart design and soft fabric. Runs a touch long but I like it that way for the oversized look." },
    { rating: 3, title: "Heart print a bit small", body: "Love the heart design but the graphic is a bit smaller than I expected. Fabric quality is still great." },
    { rating: 5, title: "Simple and lovely ❤️", body: "The heart print is simple but so lovely in person. Fast delivery to Colombo and smooth COD payment." },
    { rating: 4, title: null, body: "Heart print tee is easy to style and the fabric feels premium for the price. Ordered a size up as suggested and it fits great." },
    { rating: 5, title: "Bought as a couple's gift", body: "Got two heart print tees for me and my partner, both arrived well packed. Print is clean and matches the photo exactly." },
    { rating: 5, title: "Great everyday basic", body: "The heart design is small and tasteful, not over the top. Fabric is soft and hasn't lost shape after multiple washes." },
  ],
  "just-grow": [
    { rating: 5, title: "Love the message", body: "The 'Just Grow' print is so motivating, I get compliments every time I wear it. Fabric is thick and the print hasn't faded after washing." },
    { rating: 5, title: null, body: "Bought this for a friend going through a rough time and the 'Just Grow' text really means something to her. Soft cotton, oversized fit is perfect." },
    { rating: 4, title: "Simple but powerful", body: "The Just Grow slogan is bold and the font print is crisp. Runs a bit long but that suits the oversized style." },
    { rating: 5, title: "Great daily reminder 🌱", body: "I love wearing this as a little daily reminder to keep growing. Fabric feels premium and breathable, true to size." },
    { rating: 4, title: null, body: "Nice quality tee with a clean 'Just Grow' print. Delivery to Kandy took about 4 days but well worth the wait." },
    { rating: 3, title: "Text could be bigger", body: "Like the meaning behind the 'Just Grow' design but wish the text print was a little bigger. Fabric and fit are still good." },
    { rating: 5, title: "Meaningful and comfy", body: "This tee grows on you — the 'Just Grow' print is simple and the material is soft and thick." },
    { rating: 4, title: null, body: "Bought the 'Just Grow' tee after a rough year and it's become a bit of a comfort item. Fabric is thick and washes well." },
    { rating: 5, title: "Gift for a graduate", body: "Gave this 'Just Grow' tee to my cousin who just graduated, the message fit the moment perfectly. Great print quality too." },
    { rating: 4, title: "Simple slogan, good quality", body: "The 'Just Grow' text print is minimal and clean, no cracking after a few washes. Fits true to size for a Large." },
  ],
  looney: [
    { rating: 5, title: "Looney Tunes fan here", body: "The looney print is so fun and nostalgic. Fabric is thick and the oversized fit is exactly what I wanted." },
    { rating: 5, title: null, body: "Grew up watching these cartoons so the looney tee was an instant buy. Print quality is excellent and colours are vivid." },
    { rating: 4, title: "Fun looney design", body: "Looney print is exactly like the picture and fit is comfy oversized. Wish there were more character options." },
    { rating: 5, title: "So nostalgic", body: "This looney tee brings back so many childhood memories. Soft cotton, breathable, print hasn't faded after washing." },
    { rating: 4, title: null, body: "Nice looney graphic and thick material. Took about 3 days to deliver to Colombo, no issues with COD." },
    { rating: 3, title: "Print smaller than expected", body: "Love the looney design but the character graphic is a little smaller than I hoped. Fabric quality is still solid." },
    { rating: 5, title: "Great gift for cartoon fans", body: "Bought this looney tee for my brother who loves cartoons, he was thrilled. True to size, thick 220 GSM fabric." },
    { rating: 4, title: null, body: "Looney print tee is a fun conversation starter and the fabric held up well after washing. Fits a little loose which suits the style." },
    { rating: 5, title: "Best cartoon tee I've bought", body: "Compared to other looney merch I've bought online, this one has the best print quality by far. Highly recommend." },
    { rating: 4, title: "Looney design is accurate", body: "The looney character print matches the reference image closely and the stitching is solid throughout." },
  ],
  penguin: [
    { rating: 5, title: "So cute 🐧", body: "The penguin print is adorable and the oversized fit is exactly what I wanted. Fabric feels thick and premium." },
    { rating: 5, title: null, body: "Bought the penguin tee for my daughter and she loves it. Print is crisp and hasn't faded after several washes." },
    { rating: 4, title: "Cute penguin design", body: "Penguin print is exactly like the photo and fit is comfortably oversized. Wish there were more colour options." },
    { rating: 5, title: "Adorable", body: "This penguin tee is so cute, print quality is excellent and the material is soft and breathable." },
    { rating: 4, title: null, body: "Nice penguin graphic and soft fabric. Runs a touch long but that's fine for the oversized look." },
    { rating: 3, title: "Penguin print a bit faded feeling", body: "The penguin design is cute but the colours felt slightly muted compared to the photo. Fabric and fit are still good." },
    { rating: 5, title: "Waddle-worthy", body: "Everyone asks about my penguin tee. Fast delivery to Colombo and smooth COD payment, highly recommend." },
    { rating: 4, title: null, body: "Penguin print tee is soft and holds its shape well. Ordered a Medium and it fits the oversized look nicely." },
    { rating: 5, title: "Kids and adults both love it", body: "Bought matching penguin tees for me and my niece. Both fit true to size and the print quality is identical on both." },
    { rating: 4, title: "Penguin print is well made", body: "Good stitching around the penguin graphic, no loose threads. Fabric is thick enough for cooler evenings too." },
  ],
  "sea-lovers": [
    { rating: 5, title: "Perfect for sea lovers", body: "This sea print tee is gorgeous, the wave design came out crisp. Fabric feels thick and the oversized fit is perfect." },
    { rating: 5, title: null, body: "As a sea lover I had to get this one. Print quality is excellent and the material is soft and breathable." },
    { rating: 4, title: "Lovely sea design", body: "The sea-themed print is exactly like the photo and the fit is comfortably oversized. Wish there were more colours." },
    { rating: 5, title: "Ocean vibes 🌊", body: "Bought this for the sea vibes and it did not disappoint — thick 220 GSM fabric, true to size." },
    { rating: 4, title: null, body: "Nice sea print and soft fabric. Took about 4 days to deliver to Kandy but well worth it." },
    { rating: 3, title: "Wanted brighter colours", body: "Love the sea design but expected the blue tones to be a bit brighter. Fabric quality is still great." },
    { rating: 2, title: "Print faded quicker than hoped", body: "The sea print looked amazing at first but faded a bit more than I expected after a few washes. Fabric itself is still comfortable." },
    { rating: 5, title: null, body: "Living near the coast, this sea themed tee felt like it was made for me. Fabric is thick and the fit is a proper oversized cut." },
    { rating: 4, title: "Good beach day tee", body: "Wore this sea print tee on a trip to Mirissa and it held up fine in the heat. Breathable cotton, true to size." },
    { rating: 5, title: "Calming design", body: "The sea themed print has a nice calming colour palette and the material feels premium. Delivery to Colombo was quick too." },
  ],
  panda: [
    { rating: 5, title: "So cute! 🐼", body: "The panda print is adorable and the oversized fit is exactly what I wanted. Fabric feels thick and doesn't feel see-through at all." },
    { rating: 5, title: null, body: "Bought the panda tee for my daughter and she hasn't stopped wearing it. Print is crisp and hasn't faded after several washes." },
    { rating: 4, title: "Cute panda design", body: "Panda print is exactly like the picture and the fit is comfortably oversized. Only wish there were more colour options." },
    { rating: 5, title: "Love it", body: "This panda tee is adorable, print quality is excellent and the material is soft and breathable." },
    { rating: 4, title: null, body: "Nice panda graphic and thick fabric. Runs a touch long but that's fine for the oversized look." },
    { rating: 3, title: "Panda print a bit small", body: "Love the panda design but the graphic felt a little smaller than I expected from the photos. Fabric quality is still good." },
    { rating: 5, title: "Everyone asks about it", body: "Get compliments on this panda tee every time I wear it. Fast delivery to Colombo and smooth COD payment." },
  ],
  snoopy: [
    { rating: 5, title: "Snoopy fan for life", body: "The snoopy print is so nostalgic and the colour is exactly as shown. Soft, thick material — very happy with this one." },
    { rating: 5, title: null, body: "Been wanting a snoopy tee for ages and this one didn't disappoint. Great print, comfy oversized fit, fast delivery." },
    { rating: 4, title: "Cute, ordered a size up", body: "Love the snoopy design and the fabric feels premium. Ordered M and it fits nicely oversized." },
    { rating: 5, title: "Adorable", body: "The snoopy print is adorable and really sharp. Got so many compliments already!" },
    { rating: 5, title: null, body: "This snoopy tee is perfect. Print matches the photo and the material is soft and breathable." },
    { rating: 4, title: "Nice snoopy print", body: "Snoopy graphic looks great and quality is solid. Delivery took a few days but worth the wait." },
    { rating: 3, title: "Print smaller than expected", body: "The snoopy print is a little smaller than I thought, but it's cute and the fabric is good quality." },
  ],
};

// Live category slugs that map onto a template set defined under a different key.
// Dev/mock uses "cat"; the production catalogue uses "cats". "sealovers" is the
// live (unhyphenated) slug for the "sea-lovers" template set below.
const CATEGORY_SLUG_ALIASES: Record<string, string> = {
  cats: "cat",
  sealovers: "sea-lovers",
};

export function reviewPoolForCategory(slug: string): ReviewTemplate[] {
  const key = CATEGORY_SLUG_ALIASES[slug] ?? slug;
  return [...SHARED_REVIEWS, ...(CATEGORY_REVIEWS[key] ?? [])];
}
