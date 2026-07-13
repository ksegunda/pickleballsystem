import { AlertTriangle } from "lucide-react";
import { formatWaitTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

// After this long without a fresh sync, treat the on-screen data as
// possibly stale — realtime is supposed to push updates near-instantly,
// so a gap this size usually means a dropped/delayed subscription rather
// than "nothing happened yet."
const STALE_AFTER_SECONDS = 30;

interface LastSyncedIndicatorProps {
  secondsSinceSync: number;
  // Queue view (prominent): a stale sync is a warning pill, hard to miss.
  // Stats view (subtle): a stale sync is just quieter muted text — the
  // data there matters less moment-to-moment than a live queue position.
  variant: "prominent" | "subtle";
  className?: string;
}

function syncedText(seconds: number): string {
  if (seconds < 5) return "Synced just now";
  return `Synced ${formatWaitTime(seconds)} ago`;
}

export function LastSyncedIndicator({ secondsSinceSync, variant, className }: LastSyncedIndicatorProps) {
  const isStale = secondsSinceSync >= STALE_AFTER_SECONDS;

  if (variant === "prominent") {
    if (!isStale) {
      return (
        <span className={cn("text-xs text-muted-foreground", className)}>
          {syncedText(secondsSinceSync)}
        </span>
      );
    }
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400",
          className
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Data may be stale · {syncedText(secondsSinceSync)}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "text-xs",
        isStale ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
        className
      )}
    >
      {syncedText(secondsSinceSync)}
    </span>
  );
}
