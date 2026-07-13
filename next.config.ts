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
  // "/" is a pure auth-redirect decision (→ /sessions or /login depending on
  // who's logged in right now), not real content — next-pwa's defaults
  // (cacheStartUrl/dynamicStartUrl) cache whichever destination it resolved
  // to under a NetworkFirst strategy, which can replay a stale redirect
  // (e.g. an old, now-logged-out session's "/sessions") on a slow/flaky
  // connection instead of hitting the server for a fresh auth check.
  // Explicitly disabled — never cache an auth-dependent redirect.
  cacheStartUrl:    false,
  dynamicStartUrl:  false,
});

export default withPWA(nextConfig);
