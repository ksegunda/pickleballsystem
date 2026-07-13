"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { WifiOff, CheckCircle2 } from "lucide-react";
import { useConnectionStatus } from "@/lib/hooks/useConnectionStatus";

type BannerState = "hidden" | "offline" | "reconnected";

const RECONNECTED_DISPLAY_MS = 2500;

export function ConnectionBanner() {
  const status = useConnectionStatus();
  const [bannerState, setBannerState] = useState<BannerState>("hidden");
  const wasOffline = useRef(false);

  useEffect(() => {
    if (status === "offline") {
      wasOffline.current = true;
      setBannerState("offline");
      return;
    }

    // Only flash "back online" if we were actually showing "offline" —
    // not on normal first mount, which starts "online" with nothing to report.
    if (wasOffline.current) {
      wasOffline.current = false;
      setBannerState("reconnected");
      const timeout = setTimeout(() => setBannerState("hidden"), RECONNECTED_DISPLAY_MS);
      return () => clearTimeout(timeout);
    }
  }, [status]);

  return (
    <AnimatePresence>
      {bannerState !== "hidden" && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className={[
            "fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium",
            bannerState === "offline"
              ? "bg-amber-500 text-amber-950"
              : "bg-green-600 text-white",
          ].join(" ")}
        >
          {bannerState === "offline" ? (
            <>
              <WifiOff className="h-3.5 w-3.5" />
              You&apos;re offline — updates may be delayed
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Back online
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
