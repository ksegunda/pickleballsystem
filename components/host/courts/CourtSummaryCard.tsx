"use client";

import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CourtStatusBadge } from "@/components/shared/StatusBadge";
import { TimerDisplay } from "@/components/shared/TimerDisplay";
import { cn } from "@/lib/utils/cn";
import type { CourtView } from "@/types/match.types";
import type { TeamSide } from "@/types/database.types";

interface CourtSummaryCardProps {
  court: CourtView;
}

interface CourtMatchPlayer {
  player_id:    string;
  display_name: string;
  team:         TeamSide;
}

// Read-only glance card for the Overview page — same status logic as
// CourtCard, but no action buttons. Taking a match to its next state
// still happens on the Courts page.
export function CourtSummaryCard({ court }: CourtSummaryCardProps) {
  const isFree       = court.match_id === null && court.court_status !== "maintenance";
  const isInProgress = court.match_status === "in_progress";
  const isPending    = court.match_status === "pending";
  const players      = (court.players as unknown as CourtMatchPlayer[]) ?? [];

  const borderClass = isFree
    ? "court-available"
    : isInProgress
    ? "court-occupied"
    : isPending
    ? "court-ready"
    : "";

  return (
    <Card className={cn(borderClass)}>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{court.court_name}</p>
          {isFree ? (
            <CourtStatusBadge status="available" />
          ) : isInProgress ? (
            <TimerDisplay startedAt={court.started_at} size="sm" />
          ) : (
            <span className="shrink-0 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
              Ready
            </span>
          )}
        </div>
        {isFree ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5 shrink-0" />
            No match assigned
          </p>
        ) : (
          <p className="truncate text-xs text-muted-foreground">
            {players.map((p) => p.display_name).join(" · ") || "—"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
