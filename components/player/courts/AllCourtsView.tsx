"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Swords } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getAllCourtsAction } from "@/actions/match.actions";
import { getStoredPlayerIdentity } from "@/lib/utils/player-identity";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { LastSyncedIndicator } from "@/components/shared/LastSyncedIndicator";
import { EmptyState } from "@/components/shared/EmptyState";
import { CourtStatusBadge } from "@/components/shared/StatusBadge";
import { TimerDisplay } from "@/components/shared/TimerDisplay";
import { useElapsedSeconds } from "@/lib/hooks/useElapsedSeconds";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import type { Session } from "@/types/session.types";
import type { CourtView } from "@/types/match.types";
import type { TeamSide } from "@/types/database.types";

interface AllCourtsViewProps {
  session: Session;
}

interface CourtMatchPlayer {
  player_id:    string;
  display_name: string;
  team:         TeamSide;
}

function CourtRow({ court, myPlayerId }: { court: CourtView; myPlayerId: string | null }) {
  const players = (court.players as unknown as CourtMatchPlayer[]) ?? [];
  const teamA   = players.filter((p) => p.team === "team_a");
  const teamB   = players.filter((p) => p.team === "team_b");
  const isFree       = court.match_id === null && court.court_status !== "maintenance";
  const isInProgress = court.match_status === "in_progress";
  const hasMe        = players.some((p) => p.player_id === myPlayerId);

  return (
    <Card className={cn(hasMe && "border-2 border-primary/40 bg-primary/5")}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-accent-foreground" />
            <span className="font-semibold text-foreground">{court.court_name}</span>
          </div>
          {isFree ? (
            <CourtStatusBadge status="available" />
          ) : isInProgress ? (
            <TimerDisplay startedAt={court.started_at} size="sm" />
          ) : (
            <span className="rounded-full bg-accent/20 px-2.5 py-1 text-xs font-semibold text-accent-foreground">
              Ready
            </span>
          )}
        </div>

        {isFree ? (
          <p className="text-sm text-muted-foreground">No match right now.</p>
        ) : (
          <div className="flex items-center gap-3 text-sm">
            <div className="min-w-0 flex-1 space-y-0.5">
              {teamA.map((p) => (
                <p key={p.player_id} className={cn("truncate", p.player_id === myPlayerId ? "font-bold text-primary" : "text-foreground")}>
                  {p.display_name}
                </p>
              ))}
            </div>
            <Swords className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 space-y-0.5 text-right">
              {teamB.map((p) => (
                <p key={p.player_id} className={cn("truncate", p.player_id === myPlayerId ? "font-bold text-primary" : "text-foreground")}>
                  {p.display_name}
                </p>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AllCourtsView({ session }: AllCourtsViewProps) {
  const [courts, setCourts]   = useState<CourtView[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const syncSecs = useElapsedSeconds(lastSyncedAt?.toISOString(), lastSyncedAt !== null);

  useEffect(() => {
    setMyPlayerId(getStoredPlayerIdentity(session.id)?.player_id ?? null);
  }, [session.id]);

  const load = useCallback(async () => {
    const data = await getAllCourtsAction(session.id);
    setCourts(data);
    setLoading(false);
    setLastSyncedAt(new Date());
  }, [session.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const supabase = createClient();
    const channel  = supabase.channel(`session:${session.id}:all-courts`);

    for (const table of ["courts", "matches", "match_players"]) {
      channel.on("postgres_changes", {
        event: "*", schema: "public", table, filter: `session_id=eq.${session.id}`,
      }, () => load());
    }

    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session.id, load]);

  if (loading) {
    return (
      <div className="px-5 pt-6 pb-2 space-y-3 max-w-md mx-auto">
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        <div className="h-28 w-full animate-pulse rounded-2xl bg-muted" />
        <div className="h-28 w-full animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-2 space-y-5 max-w-md mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">All Courts</h1>
        <div className="flex flex-col items-end gap-1">
          <LiveIndicator />
          {lastSyncedAt && <LastSyncedIndicator variant="subtle" secondsSinceSync={syncSecs} />}
        </div>
      </div>

      {courts.length === 0 ? (
        <EmptyState icon={MapPin} title="No courts yet" description="The host hasn't set up any courts." />
      ) : (
        <div className="space-y-3">
          {courts.map((court) => (
            <CourtRow key={court.court_id} court={court} myPlayerId={myPlayerId} />
          ))}
        </div>
      )}
    </div>
  );
}
