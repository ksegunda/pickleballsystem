"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getLeaderboardAction } from "@/actions/player.actions";
import { PlayerStatusBadge } from "@/components/shared/StatusBadge";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database.types";
import type { PlayerStatus } from "@/types/database.types";

type LeaderboardRow = Database["public"]["Views"]["leaderboard_view"]["Row"];

interface PlayersRosterBoardProps {
  sessionId:      string;
  initialPlayers: LeaderboardRow[];
}

const STATUS_FILTERS: Array<{ label: string; value: PlayerStatus | "all" }> = [
  { label: "All",     value: "all" },
  { label: "Waiting", value: "waiting" },
  { label: "Playing", value: "playing" },
  { label: "Resting", value: "resting" },
  { label: "Offline", value: "offline" },
];

export function PlayersRosterBoard({ sessionId, initialPlayers }: PlayersRosterBoardProps) {
  const [players, setPlayers] = useState(initialPlayers);
  const [search, setSearch]   = useState("");
  const [statusFilter, setStatusFilter] = useState<PlayerStatus | "all">("all");

  const refresh = useCallback(async () => {
    const data = await getLeaderboardAction(sessionId);
    setPlayers(data);
  }, [sessionId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`session:${sessionId}:players-roster`);

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

  const filtered = useMemo(() => {
    return players
      .filter((p) => statusFilter === "all" || p.player_status === statusFilter)
      .filter((p) => p.display_name.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [players, search, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{players.length} joined</p>
        <LiveIndicator />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.value}
              type="button"
              size="sm"
              variant={statusFilter === f.value ? "default" : "outline"}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No players found"
          description="Try a different search term or status filter."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <Card key={p.player_id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground">{p.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.games_played} games · {p.wins}W-{p.losses}L · {p.win_rate}% win rate
                  </p>
                </div>
                <PlayerStatusBadge status={p.player_status} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
