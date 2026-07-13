"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Users, UserX } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getLeaderboardAction, removePlayerAction } from "@/actions/player.actions";
import { PlayerStatusBadge } from "@/components/shared/StatusBadge";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
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
  const [removeTarget, setRemoveTarget] = useState<LeaderboardRow | null>(null);
  const [removing, setRemoving]         = useState(false);

  const refresh = useCallback(async () => {
    const data = await getLeaderboardAction(sessionId);
    setPlayers(data);
  }, [sessionId]);

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const result = await removePlayerAction(removeTarget.player_id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${removeTarget.display_name} removed from the session.`);
      setRemoveTarget(null);
      await refresh();
    } catch {
      toast.error("Could not remove this player. Please try again.");
    } finally {
      setRemoving(false);
    }
  }

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
                <div className="flex items-center gap-2">
                  <PlayerStatusBadge status={p.player_status} />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setRemoveTarget(p)}
                    title="Remove player"
                  >
                    <UserX className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.display_name}?</DialogTitle>
            <DialogDescription>
              They&apos;ll be taken off the queue and back to the join screen. If they&apos;re
              already assigned to an upcoming match, the next fair player from the queue takes
              their seat automatically. Their stats and match history stay intact — they can
              rejoin later with the join code or QR.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove} loading={removing}>
              <UserX className="h-4 w-4" />
              Remove Player
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
