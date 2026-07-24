"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Trophy, Share2, Download } from "lucide-react";
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { LeaderboardShareCard, type ShareCardPlayer } from "./LeaderboardShareCard";
import { cn } from "@/lib/utils/cn";
import type { SessionWithSummary } from "@/types/session.types";
import type { Database } from "@/types/database.types";

type LeaderboardRow = Database["public"]["Views"]["leaderboard_view"]["Row"];

const TOP_N = 10;

interface PlayerLeaderboardViewProps {
  session:       SessionWithSummary;
  // The host's own uploaded club logo (hosts.avatar_url) — distinct from
  // the PaddleSync app icon shown in AppBrandHeader. Null when the host
  // hasn't uploaded one; the block below just doesn't render then.
  hostAvatarUrl: string | null;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// html2canvas's own "wait for images" detection isn't reliable on every
// mobile browser (slower network/CPU makes it much easier to catch an
// <img> mid-load than on desktop) — waiting explicitly here removes that
// race entirely instead of hoping html2canvas's internal timing covers it.
// Resolves (doesn't reject) on a failed image load too, so one broken
// image can't hang the whole share flow forever.
function waitForImages(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll("img"));
  return Promise.all(
    imgs.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.addEventListener("load", () => resolve(), { once: true });
        img.addEventListener("error", () => resolve(), { once: true });
      });
    })
  ).then(() => undefined);
}

export function PlayerLeaderboardView({ session, hostAvatarUrl }: PlayerLeaderboardViewProps) {
  const [rows, setRows]         = useState<LeaderboardRow[] | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sharing, setSharing]       = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
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

  // Two-step by necessity, not just UX polish: iOS requires navigator.share()
  // to be invoked with "trusted user activation" still intact, which a long
  // await (html2canvas rendering can take seconds) reliably breaks — calling
  // share() straight out of an async handler throws "not allowed by the user
  // agent" on iOS Safari/Chrome. Generating first into a preview, then
  // sharing from a SECOND, fresh tap (nothing async in between) keeps that
  // activation intact. The preview also happens to be better UX regardless
  // — the player sees exactly what they're about to send before sending it.
  async function handleGeneratePreview() {
    if (!shareCardRef.current) return;
    setGenerating(true);
    try {
      await waitForImages(shareCardRef.current);
      const canvas = await html2canvas(shareCardRef.current, { backgroundColor: null, useCORS: true });
      const blob = await canvasToBlob(canvas);
      if (!blob) {
        toast.error("Could not generate the image. Please try again.");
        return;
      }
      setPreviewBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      // Temporary diagnostic — surfaces the real error text directly in the
      // toast (not just the console) so this is debuggable from a phone
      // with no cable/DevTools involved. Remove once mobile sharing is
      // confirmed working.
      console.error("Leaderboard share image generation failed:", err);
      const detail = err instanceof Error ? err.message : String(err);
      toast.error(`Could not generate the share image: ${detail}`);
    } finally {
      setGenerating(false);
    }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
  }

  async function handleShareNow() {
    if (!previewBlob) return;
    const file = new File([previewBlob], "paddlesync-leaderboard.png", { type: "image/png" });

    if (typeof navigator.canShare !== "function" || !navigator.canShare({ files: [file] })) {
      handleDownload();
      return;
    }

    setSharing(true);
    try {
      await navigator.share({ files: [file], title: session.session_name });
      closePreview();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return; // user closed the native share sheet
      console.error("Native share failed:", err);
      toast.error("Could not open the share sheet — try Download instead.");
    } finally {
      setSharing(false);
    }
  }

  function handleDownload() {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = "paddlesync-leaderboard.png";
    a.click();
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
  const totalGames   = session.summary?.matches_completed ?? "—";
  const totalCourts  = session.summary?.number_of_courts ?? "—";
  const toShareCardPlayer = (r: LeaderboardRow): ShareCardPlayer => (
    { rank: r.rank, name: r.display_name, wins: r.wins, losses: r.losses, winRate: r.win_rate }
  );
  const sharePodium: ShareCardPlayer[] = rows.slice(0, 3).map(toShareCardPlayer);
  const shareMore: ShareCardPlayer[]   = rows.slice(3, 5).map(toShareCardPlayer);
  const shareYou = me
    && !sharePodium.some((p) => p.rank === me.rank)
    && !shareMore.some((p) => p.rank === me.rank)
    ? { rank: me.rank, name: me.display_name }
    : null;

  return (
    <div className="px-5 pt-2 pb-2 space-y-5 max-w-md mx-auto">
      <div className="flex justify-end">
        <LiveIndicator />
      </div>

      <div className="text-center">
        {hostAvatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hostAvatarUrl}
            alt=""
            className="mx-auto mb-2 h-12 w-12 rounded-xl object-cover shadow-card"
          />
        )}
        <p className="text-[11px] font-bold uppercase tracking-wide text-primary">{session.club_name}</p>
        <p className="mt-1 text-lg font-extrabold text-foreground">{session.session_name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{formatDateFull(session.session_date)}</p>

        <div className="mt-3.5 flex items-center justify-center">
          {[
            { label: "Players", value: totalPlayers },
            { label: "Games",   value: totalGames },
            { label: "Courts",  value: totalCourts },
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
        <Button variant="ghost" size="sm" className="text-primary" loading={generating} onClick={handleGeneratePreview}>
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
          totalGames={totalGames}
          totalCourts={totalCourts}
          hostAvatarUrl={hostAvatarUrl}
          podium={sharePodium}
          more={shareMore}
          you={shareYou}
        />
      </div>

      <Dialog open={previewUrl !== null} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Share Rankings</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Leaderboard share preview" className="w-full rounded-2xl border border-border" />
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleDownload} className="flex-1">
              <Download className="h-4 w-4" />
              Download
            </Button>
            <Button onClick={handleShareNow} loading={sharing} className="flex-1">
              <Share2 className="h-4 w-4" />
              Share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
