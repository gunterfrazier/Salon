import type { NextConfig } from "next";

// Everything the app needs lives inside app/ (including seed/), so the
// default project root works for both Vercel and Cloudflare (OpenNext).
const nextConfig: NextConfig = {
  experimental: {
    // Color-formula photos are shrunk in the browser first; this is headroom.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;

// Lets `next dev` use Cloudflare bindings locally; no-op otherwise.
import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev()).catch(() => {});
