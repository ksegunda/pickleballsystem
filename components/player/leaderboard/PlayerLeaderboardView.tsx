"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Trophy, Share2 } from "lucide-react";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import { createClient } from "@/lib/supabase/client";
import { getLeaderboardAction } from "@/actions/player.actions";
import { getStoredPlayerIdentity } from "@/lib/utils/player-identity";
import { formatDateFull } from "@/lib/utils/format";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LeaderboardShareCard, type ShareCardPlayer } from "./LeaderboardShareCard";
import { cn } from "@/lib/utils/cn";
import type { SessionWithSummary } from "@/types/session.types";
import type { Database } from "@/types/database.types";

type LeaderboardRow = Database["public"]["Views"]["leaderboard_view"]["Row"];

const TOP_N = 10;

interface PlayerLeaderboardViewProps {
  session: SessionWithSummary;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export function PlayerLeaderboardView({ session }: PlayerLeaderboardViewProps) {
  const [rows, setRows]         = useState<LeaderboardRow[] | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [sharing, setSharing]   = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);

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

  async function handleShare() {
    if (!shareCardRef.current) return;
    setSharing(true);
    try {
      const canvas = await html2canvas(shareCardRef.current, { backgroundColor: null });
      const blob = await canvasToBlob(canvas);
      if (!blob) {
        toast.error("Could not generate the image. Please try again.");
        return;
      }
      const file = new File([blob], "paddlesync-leaderboard.png", { type: "image/png" });

      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: session.session_name });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "paddlesync-leaderboard.png";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return; // user closed the native share sheet
      toast.error("Could not generate the share image. Please try again.");
    } finally {
      setSharing(false);
    }
  }

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

  const totalPlayers = session.summary?.total_players ?? rows.length;
  const shareTop: ShareCardPlayer[] = rows.slice(0, 3).map((r) => ({ rank: r.rank, name: r.display_name, wins: r.wins }));
  const shareYou = me && !shareTop.some((p) => p.rank === me.rank) ? { rank: me.rank, name: me.display_name } : null;

  return (
    <div className="px-5 pt-6 pb-2 space-y-5 max-w-md mx-auto">
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.png" alt="" className="h-6 w-6 rounded-md" />
        <span className="text-sm font-extrabold tracking-tight text-foreground">PaddleSync</span>
        <div className="ml-auto"><LiveIndicator /></div>
      </div>

      <div className="text-center">
        <p className="text-[11px] font-bold uppercase tracking-wide text-primary">{session.club_name}</p>
        <p className="mt-1 text-lg font-extrabold text-foreground">{session.session_name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{formatDateFull(session.session_date)}</p>

        <div className="mt-3.5 flex items-center justify-center">
          {[
            { label: "Players", value: totalPlayers },
            { label: "Games",   value: session.summary?.matches_completed ?? "—" },
            { label: "Courts",  value: session.summary?.number_of_courts ?? "—" },
          ].map((s, i) => (
            <div key={s.label} className={cn("px-4", i > 0 && "border-l border-border")}>
              <p className="text-base font-extrabold tabular-nums text-foreground">{s.value}</p>
              <p className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold text-foreground">Session Rankings</h2>
        <Button variant="ghost" size="sm" className="text-primary" loading={sharing} onClick={handleShare}>
          <Share2 className="h-3.5 w-3.5" />
          Share
        </Button>
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

      {/* Off-screen — captured by html2canvas on Share, never visible on the page itself. */}
      <div style={{ position: "fixed", top: 0, left: -99999, pointerEvents: "none" }} aria-hidden>
        <LeaderboardShareCard
          ref={shareCardRef}
          clubName={session.club_name}
          sessionName={session.session_name}
          dateLabel={formatDateFull(session.session_date)}
          totalPlayers={totalPlayers}
          top={shareTop}
          you={shareYou}
        />
      </div>
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
