import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        // Vercel Blob public URLs for admin-uploaded images, e.g.
        // https://<store-id>.public.blob.vercel-storage.com/<path>
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
    // Demo product images are SVG. Safe here because they are local files in
    // /public/products that we author ourselves.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
