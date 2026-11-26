import type { MetadataRoute } from "next";

/** Lets Chairvana be added to the home screen and run like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chairvana",
    short_name: "Chairvana",
    description: "Salon calendar, clients and booking",
    start_url: "/today",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#1c1917",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
