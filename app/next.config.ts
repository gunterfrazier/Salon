import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // seed/ lives at the repository root, shared with database seeding.
  turbopack: { root: path.join(__dirname, "..") },
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
