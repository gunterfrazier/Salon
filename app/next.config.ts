import type { NextConfig } from "next";

// Everything the app needs lives inside app/ (including seed/), so the
// default project root works for both Vercel and Cloudflare (OpenNext).
const nextConfig: NextConfig = {
  // The signed-in app moved under /app. Old links (bookmarks, texts already
  // sent, home-screen icons) keep working.
  async redirects() {
    const moved = ["account", "admin", "calendar", "clients", "dashboard", "inventory", "kiosk", "legend", "login", "me", "receipt", "reports", "sell", "settings", "team", "today"];
    return moved.flatMap((p) => [
      { source: `/${p}`, destination: `/app/${p}`, permanent: false },
      { source: `/${p}/:rest*`, destination: `/app/${p}/:rest*`, permanent: false },
    ]);
  },
  experimental: {
    // Color-formula photos are shrunk in the browser first; this is headroom.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;

// Lets `next dev` use Cloudflare bindings locally; no-op otherwise.
import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev()).catch(() => {});
