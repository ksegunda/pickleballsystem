"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ConnectionStatus = "online" | "offline";

// Purely observational — never retries or forces a reconnect itself.
// Two independent signals, either one can flip us to "offline":
//   1. The browser's own online/offline events (actual network loss).
//   2. A no-op realtime channel's subscribe status, which reflects
//      Supabase's own auto-reconnecting WS socket — catches weak-signal
//      cases where the browser still thinks it's online but the socket
//      has dropped.
// Ignored until the channel has subscribed successfully at least once,
// so the normal page-load "connecting" phase never flashes the banner.
export function useConnectionStatus(): ConnectionStatus {
  const [browserOnline, setBrowserOnline] = useState(true);
  const [socketOnline, setSocketOnline]   = useState(true);

  useEffect(() => {
    setBrowserOnline(navigator.onLine);

    const handleOnline  = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const supabase = createClient();
    const channel = supabase.channel("connection-monitor");
    let hasSubscribedOnce = false;

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        hasSubscribedOnce = true;
        setSocketOnline(true);
      } else if (hasSubscribedOnce) {
        setSocketOnline(false);
      }
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      supabase.removeChannel(channel);
    };
  }, []);

  return browserOnline && socketOnline ? "online" : "offline";
}
