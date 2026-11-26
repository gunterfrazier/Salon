import type { Metadata, Viewport } from "next";
import { Cinzel, Cormorant_Garamond, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const cinzel = Cinzel({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-cinzel", display: "swap" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500"], style: ["normal", "italic"], variable: "--font-cormorant", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://chairvana.app"),
  title: { default: "Chairvana · Where your schedule finds its flow", template: "%s · Chairvana" },
  description: "Salon management and booking for salon owners and independent stylists: online booking, reminders, client records, color formulas, inventory and reports.",
  applicationName: "Chairvana",
  icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
  openGraph: { type: "website", siteName: "Chairvana", title: "Chairvana · Where your schedule finds its flow", description: "Calm, beautiful salon booking and management.", images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "Chairvana" }] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f11" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${cinzel.variable} ${cormorant.variable} ${mono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
