import type { PlayerStatus, CourtStatus, SessionStatus } from "@/types/database.types";
import {
  PLAYER_STATUS_LABELS,
  COURT_STATUS_LABELS,
  SESSION_STATUS_LABELS,
} from "@/lib/constants/status";
import { cn } from "@/lib/utils/cn";

interface PlayerStatusBadgeProps {
  status:    PlayerStatus;
  className?: string;
  showDot?:  boolean;
}

export function PlayerStatusBadge({ status, className, showDot = true }: PlayerStatusBadgeProps) {
  const colorMap: Record<PlayerStatus, string> = {
    waiting: "status-waiting",
    playing: "status-playing",
    resting: "status-resting",
    offline: "status-offline",
  };
  const dotMap: Record<PlayerStatus, string> = {
    waiting: "bg-blue-500",
    playing: "bg-green-500",
    resting: "bg-orange-500",
    offline: "bg-slate-400",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        colorMap[status],
        className
      )}
    >
      {showDot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", dotMap[status])} />
      )}
      {PLAYER_STATUS_LABELS[status]}
    </span>
  );
}

interface CourtStatusBadgeProps {
  status:    CourtStatus;
  className?: string;
}

export function CourtStatusBadge({ status, className }: CourtStatusBadgeProps) {
  const colorMap: Record<CourtStatus, string> = {
    available:   "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    occupied:    "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    maintenance: "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        colorMap[status],
        className
      )}
    >
      {COURT_STATUS_LABELS[status]}
    </span>
  );
}

interface SessionStatusBadgeProps {
  status:    SessionStatus;
  className?: string;
}

export function SessionStatusBadge({ status, className }: SessionStatusBadgeProps) {
  const colorMap: Record<SessionStatus, string> = {
    pending:  "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    active:   "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    paused:   "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    ended:    "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
    archived: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        colorMap[status],
        className
      )}
    >
      {SESSION_STATUS_LABELS[status]}
    </span>
  );
}
