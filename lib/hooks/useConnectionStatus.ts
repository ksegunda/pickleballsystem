"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ConnectionStatus = "online" | "offline";

const POLL_INTERVAL_MS = 1000;
// Absorbs a transient blip during the WS handshake (or a brief internal
// reconnect) without weakening real offline detection — a genuine outage
// persists well past this and still reports correctly, a normal page-load
// "connecting" moment never does.
const OFFLINE_GRACE_MS = 3000;

// Purely observational — never retries or forces a reconnect itself.
// Two independent signals, either one can flip us to "offline":
//   1. The browser's own online/offline events (actual network loss).
//   2. Supabase's own shared realtime socket's connectionState(), polled
//      directly — a truthful, synchronous read of the actual WS state,
//      not inferred from a single channel's subscribe-callback timing
//      (which turned out to report transient non-"SUBSCRIBED" states
//      during normal connection setup, causing false-positive "offline"
//      banners on every page load/refresh).
export function useConnectionStatus(): ConnectionStatus {
  const [browserOnline, setBrowserOnline] = useState(true);
  const [socketOnline, setSocketOnline]   = useState(true);
  const offlineSinceRef = useRef<number | null>(null);

  useEffect(() => {
    setBrowserOnline(navigator.onLine);

    const handleOnline  = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const supabase = createClient();
    // Ensures the socket actually attempts to connect on this page even if
    // no other component happens to open a channel first — the polling
    // below reads the shared client's real state, this channel's own
    // subscribe status is never itself inspected.
    const channel = supabase.channel("connection-monitor");
    channel.subscribe();

    const interval = setInterval(() => {
      const isOpen = supabase.realtime.connectionState() === "open";
      if (isOpen) {
        offlineSinceRef.current = null;
        setSocketOnline(true);
        return;
      }
      if (offlineSinceRef.current === null) {
        offlineSinceRef.current = Date.now();
      }
      if (Date.now() - offlineSinceRef.current >= OFFLINE_GRACE_MS) {
        setSocketOnline(false);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  return browserOnline && socketOnline ? "online" : "offline";
}
