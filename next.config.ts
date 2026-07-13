import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

// Precaches the built app shell (JS/CSS/HTML) so the app still loads
// offline. No runtime API caching here on purpose — data freshness for
// queue/match state is handled separately (optimistic join, realtime
// reconnect banner, last-synced indicators), not by this cache layer.
// Self-disables in development, so it never touches the Turbopack dev
// pipeline (`next dev --turbopack`) — production builds already run on
// plain webpack regardless of that flag.
const withPWA = withPWAInit({
  dest:    "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
});

export default withPWA(nextConfig);
