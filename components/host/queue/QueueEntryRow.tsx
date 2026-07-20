"use client";

import { Lock, Unlock, Users2 } from "lucide-react";
import { useElapsedSeconds } from "@/lib/hooks/useElapsedSeconds";
import { PlayerStatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { formatWaitTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { Database, LockType } from "@/types/database.types";

type QueueRow = Database["public"]["Views"]["queue_with_stats"]["Row"];

const LOCK_LABELS: Record<LockType, string> = {
  partner_pair: "Partner Lock",
  full_match:   "Full Match Lock",
};

const LOCK_ICONS: Record<LockType, typeof Users2> = {
  partner_pair: Users2,
  full_match:   Lock,
};

const LOCK_STYLES: Record<LockType, string> = {
  partner_pair: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  full_match:   "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
};

interface QueueEntryRowProps {
  entry:          QueueRow;
  position:       number;
  lockType?:      LockType | null;
  onUnlock?:      () => void;
  selectable?:    boolean;
  selected?:      boolean;
  onToggleSelect?: () => void;
}

export function QueueEntryRow({
  entry, position, lockType = null, onUnlock, selectable = false, selected = false, onToggleSelect,
}: QueueEntryRowProps) {
  const waitSecs = useElapsedSeconds(entry.entered_queue, entry.queue_status === "waiting");
  const LockIcon = lockType ? LOCK_ICONS[lockType] : null;
  const canSelect = selectable && !lockType;

  return (
    <Card
      className={cn(canSelect && "cursor-pointer", selected && "border-primary ring-1 ring-primary")}
      onClick={canSelect ? onToggleSelect : undefined}
    >
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {canSelect && (
            <Checkbox checked={selected} onCheckedChange={onToggleSelect} onClick={(e) => e.stopPropagation()} />
          )}
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {position}
          </div>
          <div>
            <p className="font-semibold text-foreground">{entry.display_name}</p>
            <p className="text-xs text-muted-foreground">
              {entry.games_played} games · {entry.win_rate}% win rate
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lockType && LockIcon && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                LOCK_STYLES[lockType]
              )}
            >
              <LockIcon className="h-3 w-3" />
              {LOCK_LABELS[lockType]}
            </span>
          )}
          {lockType && onUnlock && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Unlock"
              onClick={(e) => { e.stopPropagation(); onUnlock(); }}
            >
              <Unlock className="h-3.5 w-3.5" />
            </Button>
          )}
          {!lockType && (
            <div className="text-right">
              <PlayerStatusBadge status={entry.player_status} showDot={false} />
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {formatWaitTime(waitSecs)}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
