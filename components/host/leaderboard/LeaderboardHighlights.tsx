"use client";

import Link from "next/link";
import { Trophy, TrendingUp, Flame } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { ROUTES } from "@/lib/constants/routes";
import type { Database } from "@/types/database.types";

type LeaderboardRow = Database["public"]["Views"]["leaderboard_view"]["Row"];

interface LeaderboardHighlightsProps {
  sessionId: string;
  players:   LeaderboardRow[];
}

// Condensed, presentational leaderboard for the Overview page — top 3 by
// rank plus a couple of standout stats. Data/realtime is owned by the
// parent (OverviewSummary); this component just renders what it's given.
export function LeaderboardHighlights({ sessionId, players }: LeaderboardHighlightsProps) {
  const header = (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-foreground">Leaderboard</h2>
      <Button variant="ghost" size="sm" asChild>
        <Link href={ROUTES.LEADERBOARD(sessionId)}>View Full Leaderboard</Link>
      </Button>
    </div>
  );

  if (players.length === 0) {
    return (
      <div className="space-y-3">
        {header}
        <EmptyState
          icon={Trophy}
          title="No rankings yet"
          description="Rankings will appear once players start finishing matches."
        />
      </div>
    );
  }

  const top3   = players.slice(0, 3);
  const played = players.filter((p) => p.games_played > 0);
  const highestWinRate = played.length > 0
    ? played.reduce((best, p) => (p.win_rate > best.win_rate ? p : best))
    : null;
  const longestStreak = played.length > 0
    ? played.reduce((best, p) => (p.longest_win_streak > best.longest_win_streak ? p : best))
    : null;

  return (
    <div className="space-y-4">
      {header}

      <div className="space-y-2">
        {top3.map((p, i) => (
          <div key={p.player_id} className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  i === 0 ? "bg-yellow-400/20 text-yellow-600 dark:text-yellow-400"
                  : i === 1 ? "bg-slate-300/30 text-slate-600 dark:text-slate-300"
                  : "bg-orange-400/20 text-orange-600 dark:text-orange-400"
                )}
              >
                {i + 1}
              </div>
              <p className="truncate text-sm font-medium text-foreground">{p.display_name}</p>
            </div>
            <p className="shrink-0 text-sm font-semibold text-foreground tabular-nums">{p.wins}W</p>
          </div>
        ))}
      </div>

      {(highestWinRate || (longestStreak && longestStreak.longest_win_streak > 0)) && (
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
          {highestWinRate && (
            <div className="flex min-w-0 items-center gap-2">
              <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Highest Win Rate</p>
                <p className="truncate text-xs font-semibold text-foreground">
                  {highestWinRate.display_name} · {highestWinRate.win_rate}%
                </p>
              </div>
            </div>
          )}
          {longestStreak && longestStreak.longest_win_streak > 0 && (
            <div className="flex min-w-0 items-center gap-2">
              <Flame className="h-4 w-4 shrink-0 text-orange-500" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Longest Streak</p>
                <p className="truncate text-xs font-semibold text-foreground">
                  {longestStreak.display_name} · {longestStreak.longest_win_streak}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
