"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCourtsBoardAction } from "@/actions/match.actions";
import { useConnectionStatus } from "@/lib/hooks/useConnectionStatus";
import { CourtCard } from "./CourtCard";
import { ForecastPoolSection } from "./ForecastPoolSection";
import { QueueLockControls } from "./QueueLockControls";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import type { CourtView, MatchEligibility, ForecastSet, LockedPlayerRow } from "@/types/match.types";
import type { Database } from "@/types/database.types";

type QueueRow = Database["public"]["Views"]["queue_with_stats"]["Row"];

interface CourtsBoardProps {
  sessionId:            string;
  initialCourts:        CourtView[];
  initialEligibility:   MatchEligibility;
  initialForecastPool:  ForecastSet[];
  initialQueue:         QueueRow[];
  initialLockedPlayers: LockedPlayerRow[];
}

export function CourtsBoard({
  sessionId, initialCourts, initialEligibility, initialForecastPool, initialQueue, initialLockedPlayers,
}: CourtsBoardProps) {
  const [courts, setCourts]           = useState(initialCourts);
  const [eligibility, setEligibility] = useState(initialEligibility);
  const [forecastPool, setForecastPool] = useState(initialForecastPool);
  const [queue, setQueue]             = useState(initialQueue);
  const [lockedPlayers, setLockedPlayers] = useState(initialLockedPlayers);

  const refresh = useCallback(async () => {
    const board = await getCourtsBoardAction(sessionId);
    setCourts(board.courts);
    setEligibility(board.eligibility);
    setForecastPool(board.forecastPool);
    setQueue(board.queue);
    setLockedPlayers(board.lockedPlayers);
  }, [sessionId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`session:${sessionId}:courts-board`);

    for (const table of ["matches", "match_players", "queue_entries", "courts", "player_statistics", "locked_sets", "locked_set_players"]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `session_id=eq.${sessionId}` },
        () => refresh()
      );
    }
    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId, refresh]);

  // Safety net for a realtime push that's late or silently dropped (see Bug 1
  // findings — CourtCard's optimistic update covers the moment of the click,
  // this covers everything after): refetch whenever the tab regains focus, or
  // when the connection flips back online after being down.
  const connectionStatus = useConnectionStatus();
  const wasOffline = useRef(false);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refresh]);

  useEffect(() => {
    if (connectionStatus === "offline") {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      refresh();
    }
  }, [connectionStatus, refresh]);

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
            onStalledRefresh={refresh}
          />
        ))}
      </div>
      <ForecastPoolSection
        sessionId={sessionId}
        sets={forecastPool}
        queue={queue}
        playersPerMatch={eligibility.playersPerMatch}
        onChanged={refresh}
      />

      <QueueLockControls
        sessionId={sessionId}
        queue={queue}
        lockedPlayers={lockedPlayers}
        onChanged={refresh}
      />
    </div>
  );
}
