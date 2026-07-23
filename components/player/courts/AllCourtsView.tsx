"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getAllCourtsAction, getPublicQueueAction } from "@/actions/match.actions";
import { getStoredPlayerIdentity } from "@/lib/utils/player-identity";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { LastSyncedIndicator } from "@/components/shared/LastSyncedIndicator";
import { EmptyState } from "@/components/shared/EmptyState";
import { CourtStatusBadge } from "@/components/shared/StatusBadge";
import { TimerDisplay } from "@/components/shared/TimerDisplay";
import { useElapsedSeconds } from "@/lib/hooks/useElapsedSeconds";
import { PickleballCourtGraphic } from "@/components/player/match/PickleballCourtGraphic";
import { formatWaitTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { Session } from "@/types/session.types";
import type { CourtView } from "@/types/match.types";
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

// Every court graphic in this grid renders at the same compact size
// regardless of how many courts the session has — a lone court just sits
// centered at grid-cell width instead of stretching bigger, so the layout
// never has to "jump" in scale as courts come and go.
function CourtCell({ court, myPlayerId }: { court: CourtView; myPlayerId: string | null }) {
  const isMaintenance = court.court_status === "maintenance";
  const isFree         = !isMaintenance && court.match_id === null;
  const isLive          = court.match_status === "in_progress";
  const hasActiveMatch  = court.match_id !== null && (court.match_status === "pending" || isLive);

  if (!hasActiveMatch) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-3.5 py-3">
        <span className="text-xs font-semibold text-foreground">{court.court_name}</span>
        <CourtStatusBadge status={isMaintenance ? "maintenance" : "available"} />
      </div>
    );
  }

  const players = (court.players as unknown as CourtMatchPlayer[]) ?? [];
  const teamA   = players.filter((p) => p.team === "team_a");
  const teamB   = players.filter((p) => p.team === "team_b");

  return (
    <PickleballCourtGraphic
      compact
      topTeam={teamA}
      bottomTeam={teamB}
      meId={myPlayerId ?? ""}
      header={
        <>
          <span className="rounded-full bg-white/95 px-2 py-0.5 text-[9px] font-extrabold text-foreground shadow">
            {court.court_name}
          </span>
          {isLive ? (
            <span className="rounded-full bg-black/40 px-2 py-0.5 text-green-300">
              <TimerDisplay startedAt={court.started_at} className="text-[9px] font-bold" />
            </span>
          ) : (
            <span className="rounded-full bg-white/95 px-2 py-0.5 text-[9px] font-extrabold uppercase text-foreground shadow">
              Ready
            </span>
          )}
        </>
      }
    />
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
  const [courts, setCourts]   = useState<CourtView[]>([]);
  const [queue, setQueue]     = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const syncSecs = useElapsedSeconds(lastSyncedAt?.toISOString(), lastSyncedAt !== null);

  useEffect(() => {
    setMyPlayerId(getStoredPlayerIdentity(session.id)?.player_id ?? null);
  }, [session.id]);

  const load = useCallback(async () => {
    const [courtsData, queueData] = await Promise.all([
      getAllCourtsAction(session.id),
      getPublicQueueAction(session.id),
    ]);
    setCourts(courtsData);
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
      <div className="px-5 pt-6 pb-2 space-y-3 max-w-md mx-auto">
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-3">
          <div className="aspect-[3/4] w-full animate-pulse rounded-2xl bg-muted" />
          <div className="aspect-[3/4] w-full animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-2 space-y-5 max-w-md mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">Courts</h1>
        <div className="flex flex-col items-end gap-1">
          <LiveIndicator />
          {lastSyncedAt && <LastSyncedIndicator variant="subtle" secondsSinceSync={syncSecs} />}
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Courts</h2>
          <span className="text-xs text-muted-foreground">{courts.length} total</span>
        </div>

        {courts.length === 0 ? (
          <EmptyState icon={MapPin} title="No courts yet" description="The host hasn't set up any courts." />
        ) : courts.length === 1 ? (
          <div className="flex justify-center">
            <div className="w-[calc(50%-0.25rem)] min-w-[140px]">
              <CourtCell court={courts[0]} myPlayerId={myPlayerId} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {courts.map((court) => (
              <CourtCell key={court.court_id} court={court} myPlayerId={myPlayerId} />
            ))}
          </div>
        )}
      </div>

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
