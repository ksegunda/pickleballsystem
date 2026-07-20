"use client";

import { Lock, Unlock, Users2 } from "lucide-react";
import { useElapsedSeconds } from "@/lib/hooks/useElapsedSeconds";
import { PlayerStatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
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
const LOCK_BORDER: Record<LockType, string> = {
  partner_pair: "border-emerald-300 dark:border-emerald-700",
  full_match:   "border-indigo-300 dark:border-indigo-700",
};
const LOCK_HEADER: Record<LockType, string> = {
  partner_pair: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  full_match:   "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
};

export interface LockedGroupMember {
  entry: QueueRow;
  rank:  number;
}

interface LockedGroupCardProps {
  lockType: LockType;
  members:  LockedGroupMember[];
  onUnlock: () => void;
}

// A player's rank here is their real, individual queue position
// (same priority_score/entered_queue ordering as everyone else) — the
// group just displays them adjacent to each other, it doesn't fabricate
// a shared position.
function MemberRow({ member }: { member: LockedGroupMember }) {
  const waitSecs = useElapsedSeconds(member.entry.entered_queue, member.entry.queue_status === "waiting");
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {member.rank}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{member.entry.display_name}</p>
          <p className="text-[11px] text-muted-foreground">
            {member.entry.games_played} games · {member.entry.win_rate}% win rate
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <PlayerStatusBadge status={member.entry.player_status} showDot={false} />
        <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{formatWaitTime(waitSecs)}</p>
      </div>
    </div>
  );
}

export function LockedGroupCard({ lockType, members, onUnlock }: LockedGroupCardProps) {
  const Icon = LOCK_ICONS[lockType];

  return (
    <Card className={cn("border-2", LOCK_BORDER[lockType])}>
      <CardContent className="space-y-2 p-2">
        <div className={cn("flex items-center justify-between rounded-md px-2.5 py-1.5", LOCK_HEADER[lockType])}>
          <span className="flex items-center gap-1.5 text-xs font-bold">
            <Icon className="h-3.5 w-3.5" />
            {LOCK_LABELS[lockType]}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-black/5 dark:hover:bg-white/10"
            title="Unlock"
            onClick={onUnlock}
          >
            <Unlock className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="space-y-1.5">
          {members.map((m) => (
            <MemberRow key={m.entry.player_id} member={m} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
