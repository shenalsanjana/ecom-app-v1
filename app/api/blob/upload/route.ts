// app/api/blob/upload/route.ts
// Admin image upload using Vercel Blob's client-upload flow (browser → Blob
// direct, bypassing Vercel's 4.5MB request-body limit).
//
// NOTE ON PATH: this route is intentionally NOT under /api/admin/*. handleUpload
// derives the embedded onUploadCompleted callbackUrl from the incoming request
// path, and Vercel Blob calls that URL server-to-server (with no session cookie)
// to finalize the upload. Under /api/admin/* the proxy.ts middleware 401s that
// cookieless callback, which fails finalization with a 400. Token generation is
// still admin-gated via requireAdminApi() in onBeforeGenerateToken (that call
// carries the admin's cookie), and the finalize callback is signature-verified
// by handleUpload — so moving off the admin matcher loses nothing security-wise.
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/app/_lib/admin-auth";

export const runtime = "nodejs";

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Gate token generation. The browser's generate-token call carries the
        // admin session cookie; the later finalize callback does not (and only
        // triggers onUploadCompleted, which is signature-verified).
        const guard = await requireAdminApi();
        if (guard instanceof Response) {
          throw new Error("Not authorized to upload images");
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_SIZE_BYTES,
          addRandomSuffix: true, // avoid filename collisions
        };
      },
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 },
    );
  }
}
