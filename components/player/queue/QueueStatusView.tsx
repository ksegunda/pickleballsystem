"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Users, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getPlayerContextAction, getCurrentMatchAction } from "@/actions/player.actions";
import { useElapsedSeconds } from "@/lib/hooks/useElapsedSeconds";
import { getStoredPlayerIdentity } from "@/lib/utils/player-identity";
import { formatWaitTime } from "@/lib/utils/format";
import { PlayerStatusBadge } from "@/components/shared/StatusBadge";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { CurrentMatchCard } from "@/components/player/match/CurrentMatchCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Session } from "@/types/session.types";
import type { PlayerWithStats } from "@/types/player.types";
import type { CurrentMatchView } from "@/types/match.types";

interface QueueStatusViewProps {
  session: Session;
}

export function QueueStatusView({ session }: QueueStatusViewProps) {
  const [player, setPlayer]           = useState<PlayerWithStats | null>(null);
  const [currentMatch, setCurrentMatch] = useState<CurrentMatchView | null>(null);
  const [loading, setLoading]         = useState(true);

  const loadPlayer = useCallback(async () => {
    const playerId = getStoredPlayerIdentity(session.id)?.player_id ?? null;
    if (!playerId) {
      setLoading(false);
      return;
    }

    const [ctx, match] = await Promise.all([
      getPlayerContextAction(playerId, session.id),
      getCurrentMatchAction(playerId, session.id),
    ]);
    if (ctx) {
      setPlayer(ctx as PlayerWithStats);
    }
    setCurrentMatch(match);
    setLoading(false);
  }, [session.id]);

  useEffect(() => {
    loadPlayer();
  }, [loadPlayer]);

  // Realtime: session-wide queue/match changes (position shifts, match generated/started/finished)
  // plus this specific player's own rows, so status flips and match assignment/result reach them
  // directly instead of relying only on the session-wide events landing at the right time.
  useEffect(() => {
    const playerId = getStoredPlayerIdentity(session.id)?.player_id ?? null;
    const supabase = createClient();
    const channel  = supabase.channel(`session:${session.id}:play-status`);

    for (const table of ["queue_entries", "matches"]) {
      channel.on("postgres_changes", {
        event:  "*",
        schema: "public",
        table,
        filter: `session_id=eq.${session.id}`,
      }, () => loadPlayer());
    }

    if (playerId) {
      channel.on("postgres_changes", {
        event: "*", schema: "public", table: "players", filter: `id=eq.${playerId}`,
      }, () => loadPlayer());

      channel.on("postgres_changes", {
        event: "*", schema: "public", table: "match_players", filter: `player_id=eq.${playerId}`,
      }, () => loadPlayer());
    }

    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session.id, loadPlayer]);

  const position = player?.queue_position ?? null;
  const waitSecs = useElapsedSeconds(player?.queue_entry?.entered_queue, position !== null);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-56 w-full rounded-3xl" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-2 space-y-5 max-w-md mx-auto">
      {/* Session header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">{session.session_name}</h1>
          <p className="text-sm text-muted-foreground">{session.club_name}</p>
        </div>
        <LiveIndicator />
      </div>

      <AnimatePresence mode="wait">
        {currentMatch ? (
          <motion.div
            key="match"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <CurrentMatchCard match={currentMatch} />
          </motion.div>
        ) : (
          <motion.div
            key="queue"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            {/* Main queue position badge */}
            <div className="flex flex-col items-center py-6">
              <AnimatePresence mode="wait">
                {position !== null ? (
                  <motion.div
                    key={`pos-${position}`}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center gap-3"
                  >
                    <div className="queue-position-badge">
                      <span>#{position}</span>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-foreground">Your Queue Position</p>
                      <p className="text-sm text-muted-foreground">
                        {position === 1
                          ? "You're next up!"
                          : position <= 4
                          ? "Almost there!"
                          : `${position - 1} players ahead of you`}
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="offline" className="flex flex-col items-center gap-3">
                    <div className="flex h-44 w-44 items-center justify-center rounded-full bg-muted shadow-card">
                      <Users className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground text-sm">Not in queue</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Status card */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <PlayerStatusBadge status={player?.status ?? "offline"} />
                </div>
                {position !== null && waitSecs > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> Waiting
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{formatWaitTime(waitSecs)}</span>
                  </div>
                )}
                {player && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Name</span>
                    <span className="text-sm font-semibold">{player.display_name}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Today's stats mini */}
      {player?.statistics && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Games",  value: player.statistics.games_played },
            { label: "Wins",   value: player.statistics.wins },
            { label: "Win %",  value: player.statistics.games_played > 0
              ? `${Math.round((player.statistics.wins / player.statistics.games_played) * 100)}%`
              : "—"
            },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-foreground tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Button variant="ghost" size="sm" className="w-full text-xs" onClick={loadPlayer}>
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh
      </Button>
    </div>
  );
}
