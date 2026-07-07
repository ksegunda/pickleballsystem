"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getLeaderboardAction } from "@/actions/player.actions";
import { getStoredPlayerIdentity } from "@/lib/utils/player-identity";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import type { Session } from "@/types/session.types";
import type { Database } from "@/types/database.types";

type LeaderboardRow = Database["public"]["Views"]["leaderboard_view"]["Row"];

const TOP_N = 10;

interface PlayerLeaderboardViewProps {
  session: Session;
}

export function PlayerLeaderboardView({ session }: PlayerLeaderboardViewProps) {
  const [rows, setRows]         = useState<LeaderboardRow[] | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await getLeaderboardAction(session.id);
    setRows(data);
  }, [session.id]);

  useEffect(() => {
    setPlayerId(getStoredPlayerIdentity(session.id)?.player_id ?? null);
    load();
  }, [session.id, load]);

  useEffect(() => {
    const supabase = createClient();
    const channel  = supabase.channel(`session:${session.id}:player-leaderboard`);

    for (const table of ["players", "player_statistics"]) {
      channel.on("postgres_changes", {
        event: "*", schema: "public", table, filter: `session_id=eq.${session.id}`,
      }, () => load());
    }

    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session.id, load]);

  if (rows === null) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Trophy}
          title="No rankings yet"
          description="Rankings will appear once players start finishing matches."
        />
      </div>
    );
  }

  const top = rows.slice(0, TOP_N);
  const me  = playerId ? rows.find((r) => r.player_id === playerId) ?? null : null;
  const meInTop = me ? top.some((r) => r.player_id === me.player_id) : false;

  return (
    <div className="px-5 pt-6 pb-2 space-y-4 max-w-md mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">Leaderboard</h1>
        <LiveIndicator />
      </div>

      <div className="space-y-2">
        {top.map((p) => (
          <LeaderboardRowCard key={p.player_id} row={p} isMe={p.player_id === me?.player_id} />
        ))}
      </div>

      {me && !meInTop && (
        <>
          <p className="text-center text-xs text-muted-foreground">···</p>
          <LeaderboardRowCard row={me} isMe />
        </>
      )}
    </div>
  );
}

function LeaderboardRowCard({ row, isMe }: { row: LeaderboardRow; isMe: boolean }) {
  return (
    <Card className={cn(isMe && "border-2 border-primary/40 bg-primary/5")}>
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
              row.rank === 1 ? "bg-yellow-400/20 text-yellow-600 dark:text-yellow-400"
              : row.rank === 2 ? "bg-slate-300/30 text-slate-600 dark:text-slate-300"
              : row.rank === 3 ? "bg-orange-400/20 text-orange-600 dark:text-orange-400"
              : "bg-primary/10 text-primary"
            )}
          >
            {row.rank}
          </div>
          <div>
            <p className="font-semibold text-foreground">
              {row.display_name}
              {isMe && <span className="ml-1.5 text-xs font-medium text-primary">(You)</span>}
            </p>
            <p className="text-xs text-muted-foreground">{row.wins}W - {row.losses}L</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-foreground tabular-nums">{row.win_rate}%</p>
          <p className="text-xs text-muted-foreground">{row.games_played} games</p>
        </div>
      </CardContent>
    </Card>
  );
}
