"use client";

import { useElapsedSeconds } from "@/lib/hooks/useElapsedSeconds";
import { PlayerStatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { formatWaitTime } from "@/lib/utils/format";
import type { Database } from "@/types/database.types";

type QueueRow = Database["public"]["Views"]["queue_with_stats"]["Row"];

interface QueueEntryRowProps {
  entry:    QueueRow;
  position: number;
}

export function QueueEntryRow({ entry, position }: QueueEntryRowProps) {
  const waitSecs = useElapsedSeconds(entry.entered_queue, entry.queue_status === "waiting");

  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
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
        <div className="text-right">
          <PlayerStatusBadge status={entry.player_status} showDot={false} />
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {formatWaitTime(waitSecs)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
