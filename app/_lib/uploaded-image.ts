// app/_lib/uploaded-image.ts
//
// Files under /uploads are written to a Docker volume at runtime by
// /api/admin/upload-local, long after the app container (and its Next.js
// standalone server) has already booted. Next's image pipeline resolves
// local file existence once at process start, so a freshly uploaded file is
// invisible to both the raw static-file route and the /_next/image
// optimizer until the app restarts. nginx serves /uploads/* directly from
// the same volume (see nginx/conf.d/app.conf), bypassing that stale state —
// but only if next/image renders the raw URL instead of routing it through
// /_next/image. Pass this to <Image unoptimized> for any src that may point
// at a runtime upload.
export function isUploadedImage(src: string): boolean {
  return src.startsWith("/uploads/");
}
