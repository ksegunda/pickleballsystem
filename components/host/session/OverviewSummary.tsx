"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getCourtsBoardAction } from "@/actions/match.actions";
import { getLeaderboardAction } from "@/actions/player.actions";
import { CourtSummaryCard } from "@/components/host/courts/CourtSummaryCard";
import { ForecastPoolSection } from "@/components/host/courts/ForecastPoolSection";
import { QueueEntryRow } from "@/components/host/queue/QueueEntryRow";
import { LeaderboardHighlights } from "@/components/host/leaderboard/LeaderboardHighlights";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants/routes";
import type { CourtView, ForecastSet } from "@/types/match.types";
import type { Database } from "@/types/database.types";

type QueueRow       = Database["public"]["Views"]["queue_with_stats"]["Row"];
type LeaderboardRow = Database["public"]["Views"]["leaderboard_view"]["Row"];

const QUEUE_PREVIEW_COUNT = 8;

interface OverviewSummaryProps {
  sessionId:           string;
  initialCourts:       CourtView[];
  initialForecastPool: ForecastSet[];
  initialQueue:        QueueRow[];
  initialLeaderboard:  LeaderboardRow[];
}

// One realtime-backed summary for the host Overview page — condensed views
// of Courts, Next Up, Queue, and Leaderboard, all reusing the same
// server actions/components their full pages already use. Single channel
// covering every table any of the four sections care about, so a match
// finishing (which touches matches + queue_entries + player_statistics in
// one go) triggers one combined refresh instead of several independent ones.
export function OverviewSummary({
  sessionId, initialCourts, initialForecastPool, initialQueue, initialLeaderboard,
}: OverviewSummaryProps) {
  const [courts, setCourts]             = useState(initialCourts);
  const [forecastPool, setForecastPool] = useState(initialForecastPool);
  const [queue, setQueue]               = useState(initialQueue);
  const [leaderboard, setLeaderboard]   = useState(initialLeaderboard);

  const refresh = useCallback(async () => {
    const [board, players] = await Promise.all([
      getCourtsBoardAction(sessionId),
      getLeaderboardAction(sessionId),
    ]);
    setCourts(board.courts);
    setForecastPool(board.forecastPool);
    setQueue(board.queue);
    setLeaderboard(players);
  }, [sessionId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`session:${sessionId}:overview-summary`);

    for (const table of ["matches", "queue_entries", "courts", "player_statistics", "players"]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `session_id=eq.${sessionId}` },
        () => refresh()
      );
    }
    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId, refresh]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Court Assignments</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courts.map((court) => (
            <CourtSummaryCard key={court.court_id} court={court} />
          ))}
        </div>
      </div>

      <ForecastPoolSection sets={forecastPool} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Queue</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href={ROUTES.COURTS(sessionId)}>View All</Link>
            </Button>
          </div>
          {queue.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No one is waiting"
              description="Players will appear here as soon as they join the queue."
            />
          ) : (
            <div className="space-y-3">
              {queue.slice(0, QUEUE_PREVIEW_COUNT).map((entry, i) => (
                <QueueEntryRow key={entry.queue_id} entry={entry} position={i + 1} />
              ))}
              {queue.length > QUEUE_PREVIEW_COUNT && (
                <p className="text-center text-xs text-muted-foreground">
                  +{queue.length - QUEUE_PREVIEW_COUNT} more waiting
                </p>
              )}
            </div>
          )}
        </div>

        <LeaderboardHighlights sessionId={sessionId} players={leaderboard} />
      </div>
    </div>
  );
}
