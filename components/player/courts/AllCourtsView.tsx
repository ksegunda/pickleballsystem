"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Users, Swords, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getAllCourtsAction, getPublicQueueAction, getPublicForecastPoolAction } from "@/actions/match.actions";
import { getStoredPlayerIdentity } from "@/lib/utils/player-identity";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { LastSyncedIndicator } from "@/components/shared/LastSyncedIndicator";
import { EmptyState } from "@/components/shared/EmptyState";
import { CourtStatusBadge } from "@/components/shared/StatusBadge";
import { TimerDisplay } from "@/components/shared/TimerDisplay";
import { useElapsedSeconds } from "@/lib/hooks/useElapsedSeconds";
import { formatWaitTime } from "@/lib/utils/format";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import type { Session } from "@/types/session.types";
import type { CourtView, ForecastSet } from "@/types/match.types";
import type { Database, TeamSide } from "@/types/database.types";

type QueueRow = Database["public"]["Views"]["queue_with_stats"]["Row"];

interface AllCourtsViewProps {
  session: Session;
}

interface CourtMatchPlayer {
  player_id:    string;
  display_name: string;
  team:         TeamSide;
}

function TeamsRow({
  teamA, teamB, myPlayerId,
}: {
  teamA: CourtMatchPlayer[];
  teamB: CourtMatchPlayer[];
  myPlayerId: string | null;
}) {
  return (
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
  );
}

function CourtRow({ court, myPlayerId }: { court: CourtView; myPlayerId: string | null }) {
  const players = (court.players as unknown as CourtMatchPlayer[]) ?? [];
  const teamA   = players.filter((p) => p.team === "team_a");
  const teamB   = players.filter((p) => p.team === "team_b");
  const isMaintenance = court.court_status === "maintenance";
  const isFree         = !isMaintenance && court.match_id === null;
  const isInProgress   = court.match_status === "in_progress";
  const hasMe           = players.some((p) => p.player_id === myPlayerId);

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
          ) : isMaintenance ? (
            <CourtStatusBadge status="maintenance" />
          ) : isInProgress ? (
            <TimerDisplay startedAt={court.started_at} size="sm" />
          ) : (
            <span className="rounded-full bg-accent/20 px-2.5 py-1 text-xs font-semibold text-accent-foreground">
              Ready
            </span>
          )}
        </div>

        {isFree || isMaintenance ? (
          <p className="text-sm text-muted-foreground">
            {isMaintenance ? "Under maintenance." : "No match right now."}
          </p>
        ) : (
          <TeamsRow teamA={teamA} teamB={teamB} myPlayerId={myPlayerId} />
        )}
      </CardContent>
    </Card>
  );
}

function ForecastRow({ set, myPlayerId }: { set: ForecastSet; myPlayerId: string | null }) {
  const teamA = set.players.filter((p) => p.team === "team_a");
  const teamB = set.players.filter((p) => p.team === "team_b");
  const label = set.isManual ? "Manual" : `Set ${set.setNumber}`;
  const hasMe = set.players.some((p) => p.player_id === myPlayerId);

  return (
    <Card className={cn(hasMe && "border-2 border-primary/40 bg-primary/5")}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <span className="rounded-full bg-accent/20 px-2.5 py-1 text-[10px] font-semibold text-accent-foreground">
            Next Up
          </span>
        </div>
        <TeamsRow teamA={teamA} teamB={teamB} myPlayerId={myPlayerId} />
      </CardContent>
    </Card>
  );
}

function QueueRowItem({ entry, position, isMe }: { entry: QueueRow; position: number; isMe: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 px-3.5 py-2.5", isMe && "bg-primary/5")}>
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold tabular-nums",
          isMe ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        )}
      >
        {position}
      </span>
      <span className={cn("flex-1 truncate text-sm", isMe ? "font-extrabold text-primary" : "font-semibold text-foreground")}>
        {entry.display_name}
        {isMe && " (You)"}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">{formatWaitTime(entry.waiting_secs)}</span>
    </div>
  );
}

export function AllCourtsView({ session }: AllCourtsViewProps) {
  const [courts, setCourts]     = useState<CourtView[]>([]);
  const [forecastPool, setForecastPool] = useState<ForecastSet[]>([]);
  const [queue, setQueue]       = useState<QueueRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const syncSecs = useElapsedSeconds(lastSyncedAt?.toISOString(), lastSyncedAt !== null);

  useEffect(() => {
    setMyPlayerId(getStoredPlayerIdentity(session.id)?.player_id ?? null);
  }, [session.id]);

  const load = useCallback(async () => {
    const [courtsData, forecastData, queueData] = await Promise.all([
      getAllCourtsAction(session.id),
      getPublicForecastPoolAction(session.id),
      getPublicQueueAction(session.id),
    ]);
    setCourts(courtsData);
    setForecastPool(forecastData);
    setQueue(queueData);
    setLoading(false);
    setLastSyncedAt(new Date());
  }, [session.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const supabase = createClient();
    const channel  = supabase.channel(`session:${session.id}:all-courts`);

    for (const table of ["courts", "matches", "match_players", "queue_entries"]) {
      channel.on("postgres_changes", {
        event: "*", schema: "public", table, filter: `session_id=eq.${session.id}`,
      }, () => load());
    }

    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session.id, load]);

  if (loading) {
    return (
      <div className="px-5 pt-2 pb-2 space-y-3 max-w-md mx-auto">
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        <div className="h-28 w-full animate-pulse rounded-2xl bg-muted" />
        <div className="h-28 w-full animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="px-5 pt-2 pb-2 space-y-5 max-w-md mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">Courts</h1>
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

      {forecastPool.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Next Up</h2>
          </div>
          <div className="space-y-3">
            {forecastPool.map((set) => (
              <ForecastRow key={set.matchId} set={set} myPlayerId={myPlayerId} />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Queue</h2>
          <span className="text-xs text-muted-foreground">{queue.length} waiting</span>
        </div>

        {queue.length === 0 ? (
          <EmptyState icon={Users} title="Queue is empty" description="No one's waiting right now." />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {queue.map((entry, i) => (
              <QueueRowItem key={entry.queue_id} entry={entry} position={i + 1} isMe={entry.player_id === myPlayerId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
