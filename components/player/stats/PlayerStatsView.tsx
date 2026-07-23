"use client";

import { useCallback, useEffect, useState } from "react";
import { Flame, History } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getPlayerContextAction, getMatchHistoryAction } from "@/actions/player.actions";
import { getStoredPlayerIdentity } from "@/lib/utils/player-identity";
import { timeAgo } from "@/lib/utils/format";
import { useElapsedSeconds } from "@/lib/hooks/useElapsedSeconds";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { LastSyncedIndicator } from "@/components/shared/LastSyncedIndicator";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import type { Session } from "@/types/session.types";
import type { PlayerWithStats } from "@/types/player.types";
import type { MatchHistoryEntry } from "@/types/match.types";

interface PlayerStatsViewProps {
  session: Session;
}

export function PlayerStatsView({ session }: PlayerStatsViewProps) {
  const [player, setPlayer]   = useState<PlayerWithStats | null>(null);
  const [history, setHistory] = useState<MatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const syncSecs = useElapsedSeconds(lastSyncedAt?.toISOString(), lastSyncedAt !== null);

  const load = useCallback(async () => {
    const identity = getStoredPlayerIdentity(session.id);
    if (!identity?.player_id) {
      setLoading(false);
      return;
    }

    const [ctx, matchHistory] = await Promise.all([
      getPlayerContextAction(identity.player_id, session.id),
      getMatchHistoryAction(session.id, identity.player_id),
    ]);
    if (ctx) setPlayer(ctx as PlayerWithStats);
    setHistory(matchHistory);
    setLoading(false);
    setLastSyncedAt(new Date());
  }, [session.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const identity = getStoredPlayerIdentity(session.id);
    const supabase = createClient();
    const channel  = supabase.channel(`session:${session.id}:player-stats`);

    channel.on("postgres_changes", {
      event: "*", schema: "public", table: "matches", filter: `session_id=eq.${session.id}`,
    }, () => load());

    if (identity) {
      channel.on("postgres_changes", {
        event: "*", schema: "public", table: "player_statistics", filter: `player_id=eq.${identity.player_id}`,
      }, () => load());
    }

    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session.id, load]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="p-6">
        <EmptyState
          title="Not joined yet"
          description="Join this session from your invite link to see your stats."
        />
      </div>
    );
  }

  const stats = player.statistics;
  const gamesPlayed = stats?.games_played ?? 0;
  const wins        = stats?.wins ?? 0;
  const losses      = stats?.losses ?? 0;
  const winRate     = gamesPlayed === 0 ? 0 : Math.round((wins / gamesPlayed) * 100);

  return (
    <div className="px-5 pt-2 pb-2 space-y-5 max-w-md mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">My Statistics</h1>
        <div className="flex flex-col items-end gap-1">
          <LiveIndicator />
          {lastSyncedAt && <LastSyncedIndicator variant="subtle" secondsSinceSync={syncSecs} />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Games Played", value: gamesPlayed },
          { label: "Win Rate",     value: `${winRate}%` },
          { label: "Wins",         value: wins },
          { label: "Losses",       value: losses },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground tabular-nums">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            <span className="text-sm text-muted-foreground">Current win streak</span>
          </div>
          <span className="font-bold text-foreground tabular-nums">{stats?.current_win_streak ?? 0}</span>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">Longest win streak</span>
          </div>
          <span className="font-bold text-foreground tabular-nums">{stats?.longest_win_streak ?? 0}</span>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Match History</h2>
        </div>

        {history.length === 0 ? (
          <EmptyState
            icon={History}
            title="No matches yet"
            description="Your completed matches will show up here."
          />
        ) : (
          <div className="space-y-2">
            {history.map((m) => (
              <Card key={m.matchId}>
                <CardContent className="p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-bold",
                        m.result === "win"
                          ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      )}
                    >
                      {m.result === "win" ? "WIN" : "LOSS"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {m.endedAt ? timeAgo(m.endedAt) : ""}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">
                    {m.partner ? `with ${m.partner}` : "Singles"}
                    {m.opponents.length > 0 && ` vs ${m.opponents.join(" & ")}`}
                  </p>
                  <p className="text-xs text-muted-foreground">{m.courtName}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
