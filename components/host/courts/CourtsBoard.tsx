"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCourtsBoardAction } from "@/actions/match.actions";
import { useConnectionStatus } from "@/lib/hooks/useConnectionStatus";
import { CourtCard } from "./CourtCard";
import { ForecastPoolSection } from "./ForecastPoolSection";
import { QueueLockControls } from "./QueueLockControls";
import { TeamEditModal } from "./TeamEditModal";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import type { CourtView, MatchEligibility, ForecastSet, LockedPlayerRow } from "@/types/match.types";
import type { Database, TeamSide } from "@/types/database.types";

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
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);

  // Looks up whichever court/set the host just clicked "edit players" on —
  // the modal only ever needs this one match's own roster, not the whole
  // board, now that editing can't reach outside it.
  const editingMatch = useMemo(() => {
    if (!editingMatchId) return null;
    const court = courts.find((c) => c.match_id === editingMatchId);
    if (court) {
      return {
        matchId: editingMatchId,
        label:   court.court_name,
        players: (court.players as unknown as Array<{ player_id: string; display_name: string; team: TeamSide }>) ?? [],
      };
    }
    const set = forecastPool.find((s) => s.matchId === editingMatchId);
    if (set) {
      return {
        matchId: editingMatchId,
        label:   set.isManual ? "Manual" : `Set ${set.setNumber}`,
        players: set.players,
      };
    }
    return null;
  }, [editingMatchId, courts, forecastPool]);

  const refresh = useCallback(async () => {
    const board = await getCourtsBoardAction(sessionId);
    setCourts(board.courts);
    setEligibility(board.eligibility);
    setForecastPool(board.forecastPool);
    setQueue(board.queue);
    setLockedPlayers(board.lockedPlayers);
  }, [sessionId]);

  // Coalesces bursts of triggers (a drag-drop's own postgres_changes echoes,
  // rapid successive drags while the roster editor is open) into one
  // refetch instead of one per event — each refresh re-runs a real write
  // RPC pipeline (assignForecastToFreeCourts -> forecast_next_sets), so
  // firing it on every single table event was both wasteful and prone to
  // landing mid-drag and interrupting the gesture. Trailing-edge: the
  // fetch fires REFRESH_DEBOUNCE_MS after the LAST trigger, not the first.
  const REFRESH_DEBOUNCE_MS = 400;
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    refreshTimeoutRef.current = setTimeout(() => {
      refreshTimeoutRef.current = null;
      refresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`session:${sessionId}:courts-board`);

    for (const table of ["matches", "match_players", "queue_entries", "courts", "player_statistics", "locked_sets", "locked_set_players"]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `session_id=eq.${sessionId}` },
        () => scheduleRefresh()
      );
    }
    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId, scheduleRefresh]);

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
            onEditPlayers={setEditingMatchId}
          />
        ))}
      </div>
      <ForecastPoolSection
        sessionId={sessionId}
        sets={forecastPool}
        queue={queue}
        playersPerMatch={eligibility.playersPerMatch}
        onChanged={scheduleRefresh}
        onEditPlayers={setEditingMatchId}
      />

      <QueueLockControls
        sessionId={sessionId}
        queue={queue}
        lockedPlayers={lockedPlayers}
        onChanged={scheduleRefresh}
      />

      <TeamEditModal
        open={editingMatchId !== null}
        onOpenChange={(open) => !open && setEditingMatchId(null)}
        sessionId={sessionId}
        matchId={editingMatch?.matchId ?? null}
        label={editingMatch?.label ?? ""}
        players={editingMatch?.players ?? []}
        playersPerMatch={eligibility.playersPerMatch}
        onSaved={scheduleRefresh}
      />
    </div>
  );
}
