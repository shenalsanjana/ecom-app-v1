import { readStorefrontPromotions } from "@/app/_lib/storefront-promotion-service";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json(await readStorefrontPromotions(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    console.error("Unable to load storefront offers", error);
    return Response.json({ offers: [], asOf: Date.now() }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
