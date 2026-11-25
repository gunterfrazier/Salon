import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Defaults are fine: pages are rendered per request (no ISR cache needed yet).
export default defineCloudflareConfig();
