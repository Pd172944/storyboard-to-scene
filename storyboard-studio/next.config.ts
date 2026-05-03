import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  env: {
    // Expose GPU/inference mode to the client for UI badges.
    // Set these in .env.local — they are read at build time.
    NEXT_PUBLIC_ENABLE_GPU: process.env.ENABLE_GPU ?? "false",
    NEXT_PUBLIC_INFERENCE_MODE: process.env.INFERENCE_MODE ?? "fal",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "fal.media",
      },
      {
        protocol: "https",
        hostname: "v3.fal.media",
      },
      {
        protocol: "https",
        hostname: "**.fal.media",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "fal-cdn.batuhan-941.workers.dev",
      },
    ],
  },
};

export default nextConfig;
