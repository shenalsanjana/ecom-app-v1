// app/api/admin/upload/route.ts
// Admin-only image upload endpoint using Vercel Blob's client-upload flow.
// The browser calls this route to mint a short-lived token, then uploads the
// file directly to Blob storage — this bypasses Vercel's 4.5MB request-body
// limit that a server-side relay would hit on real photos.
//
// Defense in depth: proxy.ts already blocks /api/admin/* for non-admins at the
// edge; requireAdminApi() re-checks here in case the matcher is ever changed.
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
        const guard = await requireAdminApi();
        if (guard instanceof Response) {
          // Abort token generation for non-admins.
          throw new Error("Not authorized to upload images");
        }
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_SIZE_BYTES,
          addRandomSuffix: true, // avoid filename collisions
        };
      },
      // Fires server-side after the upload completes. In local dev Vercel
      // cannot reach localhost, so this is skipped — the client still gets the
      // blob URL from the upload() return value, which is all we persist.
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
