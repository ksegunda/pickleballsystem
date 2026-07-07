"use client";

import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getCourtsBoardAction } from "@/actions/match.actions";
import { CourtCard } from "./CourtCard";
import { ForecastPoolSection } from "./ForecastPoolSection";
import { QueueEntryRow } from "@/components/host/queue/QueueEntryRow";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { EmptyState } from "@/components/shared/EmptyState";
import type { CourtView, MatchEligibility, ForecastSet } from "@/types/match.types";
import type { Database } from "@/types/database.types";

type QueueRow = Database["public"]["Views"]["queue_with_stats"]["Row"];

interface CourtsBoardProps {
  sessionId:            string;
  initialCourts:        CourtView[];
  initialEligibility:   MatchEligibility;
  initialForecastPool:  ForecastSet[];
  initialQueue:         QueueRow[];
}

export function CourtsBoard({
  sessionId, initialCourts, initialEligibility, initialForecastPool, initialQueue,
}: CourtsBoardProps) {
  const [courts, setCourts]           = useState(initialCourts);
  const [eligibility, setEligibility] = useState(initialEligibility);
  const [forecastPool, setForecastPool] = useState(initialForecastPool);
  const [queue, setQueue]             = useState(initialQueue);

  const refresh = useCallback(async () => {
    const board = await getCourtsBoardAction(sessionId);
    setCourts(board.courts);
    setEligibility(board.eligibility);
    setForecastPool(board.forecastPool);
    setQueue(board.queue);
  }, [sessionId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`session:${sessionId}:courts-board`);

    for (const table of ["matches", "queue_entries", "courts", "player_statistics"]) {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {eligibility.waitingCount} waiting · {eligibility.playersPerMatch} needed per match
        </p>
        <LiveIndicator />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courts.map((court) => (
          <CourtCard
            key={court.court_id}
            sessionId={sessionId}
            court={court}
            hasEnoughPlayers={eligibility.hasEnoughPlayers}
            playersPerMatch={eligibility.playersPerMatch}
          />
        ))}
      </div>
      <ForecastPoolSection sets={forecastPool} />

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Queue</h2>
        {queue.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No one is waiting"
            description="Players will appear here as soon as they join the queue."
          />
        ) : (
          <div className="space-y-3">
            {queue.map((entry, i) => (
              <QueueEntryRow key={entry.queue_id} entry={entry} position={i + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
