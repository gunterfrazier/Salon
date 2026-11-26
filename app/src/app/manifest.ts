import type { MetadataRoute } from "next";

/** Lets Chairvana be added to the home screen and run like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chairvana",
    short_name: "Chairvana",
    description: "Where your schedule finds its flow.",
    start_url: "/app/today",
    display: "standalone",
    background_color: "#0f0f11",
    theme_color: "#0f0f11",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
