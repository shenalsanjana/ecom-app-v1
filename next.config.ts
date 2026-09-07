import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    // Type checking runs in CI (`npx tsc --noEmit` in .github/workflows/deploy.yml),
    // NOT here. The deploy job declares `needs: test`, so a type error fails CI
    // and the VPS never builds — the check moved earlier, it was not removed.
    //
    // Why: `next build` runs inside the Docker builder stage on the OVH VPS,
    // where tsc took 17.1 minutes against 30.5s for the actual compile (see the
    // 2026-09-01 deploy log). The same check takes ~24s locally and on a GitHub
    // runner. That single step put the 30-minute deploy job at risk of timing out.
    //
    // If you ever remove the CI tsc step, remove this too — otherwise type
    // errors reach production unchecked.
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
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
