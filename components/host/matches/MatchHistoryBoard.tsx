"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { History, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMatchHistoryAction } from "@/actions/match.actions";
import { useConnectionStatus } from "@/lib/hooks/useConnectionStatus";
import { Card, CardContent } from "@/components/ui/card";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatDuration } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { MatchHistoryRow } from "@/types/match.types";
import type { TeamSide } from "@/types/database.types";

interface MatchHistoryPlayer {
  player_id:    string;
  display_name: string;
  team:         TeamSide;
}

interface MatchHistoryBoardProps {
  sessionId:    string;
  initialRows:  MatchHistoryRow[];
}

function durationBetween(startedAt: string | null, endedAt: string | null): string | null {
  if (!startedAt || !endedAt) return null;
  const secs = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  if (secs < 0) return null;
  return formatDuration(secs);
}

export function MatchHistoryBoard({ sessionId, initialRows }: MatchHistoryBoardProps) {
  const [rows, setRows] = useState(initialRows);

  const refresh = useCallback(async () => {
    setRows(await getMatchHistoryAction(sessionId));
  }, [sessionId]);

  // Mirrors CourtsBoard.tsx's subscription pattern — same two tables a
  // completed match touches (matches for status/winner_team/ended_at,
  // match_players for per-player result), filtered to this session.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`session:${sessionId}:match-history`);

    for (const table of ["matches", "match_players"]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `session_id=eq.${sessionId}` },
        () => refresh()
      );
    }
    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId, refresh]);

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

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No finished matches yet"
        description="Completed matches will show up here as soon as a winner is picked on any court."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rows.length} finished match{rows.length === 1 ? "" : "es"}</p>
        <LiveIndicator />
      </div>
      <div className="space-y-3">
        {rows.map((row) => {
          const players = (row.players as unknown as MatchHistoryPlayer[]) ?? [];
          const teamA = players.filter((p) => p.team === "team_a");
          const teamB = players.filter((p) => p.team === "team_b");
          const duration = durationBetween(row.started_at, row.ended_at);

          return (
            <Card key={row.match_id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Match #{row.match_number} · {row.court_name}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {duration ? `${duration} · ` : ""}
                    {row.ended_at ? new Date(row.ended_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div
                    className={cn(
                      "space-y-1 rounded-lg p-2",
                      row.winner_team === "team_a" && "bg-accent/10"
                    )}
                  >
                    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {row.winner_team === "team_a" && <Trophy className="h-3 w-3 text-accent-foreground" />}
                      Team A
                    </p>
                    {teamA.map((p) => (
                      <p key={p.player_id} className="truncate text-foreground">{p.display_name}</p>
                    ))}
                  </div>
                  <div
                    className={cn(
                      "space-y-1 rounded-lg p-2",
                      row.winner_team === "team_b" && "bg-accent/10"
                    )}
                  >
                    <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {row.winner_team === "team_b" && <Trophy className="h-3 w-3 text-accent-foreground" />}
                      Team B
                    </p>
                    {teamB.map((p) => (
                      <p key={p.player_id} className="truncate text-foreground">{p.display_name}</p>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
