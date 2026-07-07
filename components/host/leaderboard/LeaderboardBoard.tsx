"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getLeaderboardAction } from "@/actions/player.actions";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { Database } from "@/types/database.types";

type LeaderboardRow = Database["public"]["Views"]["leaderboard_view"]["Row"];

interface LeaderboardBoardProps {
  sessionId:      string;
  initialPlayers: LeaderboardRow[];
}

type SortMode = "wins" | "win_rate" | "streak";

const SORT_OPTIONS: Array<{ label: string; value: SortMode }> = [
  { label: "Most Wins",       value: "wins" },
  { label: "Highest Win Rate", value: "win_rate" },
  { label: "Longest Streak",  value: "streak" },
];

export function LeaderboardBoard({ sessionId, initialPlayers }: LeaderboardBoardProps) {
  const [players, setPlayers] = useState(initialPlayers);
  const [sortMode, setSortMode] = useState<SortMode>("wins");

  const refresh = useCallback(async () => {
    const data = await getLeaderboardAction(sessionId);
    setPlayers(data);
  }, [sessionId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`session:${sessionId}:leaderboard`);

    for (const table of ["players", "player_statistics"]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `session_id=eq.${sessionId}` },
        () => refresh()
      );
    }
    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId, refresh]);

  const sorted = useMemo(() => {
    const copy = [...players];
    if (sortMode === "win_rate") {
      copy.sort((a, b) => b.win_rate - a.win_rate || b.wins - a.wins);
    } else if (sortMode === "streak") {
      copy.sort((a, b) => b.longest_win_streak - a.longest_win_streak || b.wins - a.wins);
    } else {
      copy.sort((a, b) => a.rank - b.rank);
    }
    return copy;
  }, [players, sortMode]);

  if (players.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="No rankings yet"
        description="Rankings will appear once players start finishing matches."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {SORT_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              size="sm"
              variant={sortMode === opt.value ? "default" : "outline"}
              onClick={() => setSortMode(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <LiveIndicator />
      </div>

      <div className="space-y-3">
        {sorted.map((p, i) => (
          <Card key={p.player_id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    i === 0 ? "bg-yellow-400/20 text-yellow-600 dark:text-yellow-400"
                    : i === 1 ? "bg-slate-300/30 text-slate-600 dark:text-slate-300"
                    : i === 2 ? "bg-orange-400/20 text-orange-600 dark:text-orange-400"
                    : "bg-primary/10 text-primary"
                  )}
                >
                  {i + 1}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{p.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.wins}W - {p.losses}L
                    {p.longest_win_streak > 0 && ` · ${p.longest_win_streak} streak best`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-foreground tabular-nums">{p.win_rate}%</p>
                <p className="text-xs text-muted-foreground">{p.games_played} games</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
