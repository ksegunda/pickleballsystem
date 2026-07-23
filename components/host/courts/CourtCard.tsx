"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Zap, Play, Trophy, Pencil } from "lucide-react";
import { generateMatchAction, startMatchAction, finishMatchAction } from "@/actions/match.actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CourtStatusBadge } from "@/components/shared/StatusBadge";
import { TimerDisplay } from "@/components/shared/TimerDisplay";
import { cn } from "@/lib/utils/cn";
import type { CourtView } from "@/types/match.types";
import type { TeamSide } from "@/types/database.types";

interface CourtCardProps {
  sessionId:         string;
  court:             CourtView;
  hasEnoughPlayers:  boolean;
  playersPerMatch:   number;
  // Forces a full board refetch if an optimistic state (just started / just
  // finished) hasn't been reconciled by real data within STALL_TIMEOUT_MS —
  // the realtime push confirming it can lag (see Bug 1), and without this
  // the card would otherwise wait on that push indefinitely with no
  // fallback, which is what made Bug 4's "Wrapping up…" spinner hang.
  onStalledRefresh:  () => void;
  onEditPlayers:     (matchId: string) => void;
}

const STALL_TIMEOUT_MS = 7000;

interface CourtMatchPlayer {
  player_id:    string;
  display_name: string;
  team:         TeamSide;
}

type LoadingAction = "generate" | "start" | "team_a" | "team_b" | null;

export function CourtCard({ sessionId, court, hasEnoughPlayers, playersPerMatch, onStalledRefresh, onEditPlayers }: CourtCardProps) {
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);

  // Bridges the gap between "the action resolved" and "the parent's realtime
  // refresh actually delivered fresh props" — the card would otherwise sit
  // showing stale pending/in-progress state until that push arrives (which
  // can lag on a flaky connection), even though the write already succeeded.
  // Each ref clears itself the moment real prop data confirms the change,
  // so there's no risk of it sticking around past its usefulness.
  const [optimisticStartedAt, setOptimisticStartedAt] = useState<string | null>(null);
  const [justFinished, setJustFinished]               = useState(false);

  useEffect(() => {
    if (court.started_at) setOptimisticStartedAt(null);
  }, [court.started_at]);

  // A freshly-promoted match on this same court also has started_at: null,
  // so the effect above alone never fires across the swap — without this,
  // a stale optimisticStartedAt from the previous match survives and makes
  // isInProgress read true for a match that's actually still 'pending'.
  useEffect(() => {
    setOptimisticStartedAt(null);
  }, [court.match_id]);

  useEffect(() => {
    setJustFinished(false);
  }, [court.match_id, court.match_status]);

  useEffect(() => {
    if (!justFinished) return;
    const timeout = setTimeout(onStalledRefresh, STALL_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [justFinished, onStalledRefresh]);

  useEffect(() => {
    if (optimisticStartedAt === null) return;
    const timeout = setTimeout(onStalledRefresh, STALL_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [optimisticStartedAt, onStalledRefresh]);

  const isFinishing  = justFinished;
  const isFree       = !isFinishing && court.match_id === null && court.court_status !== "maintenance";
  const isPending    = !isFinishing && optimisticStartedAt === null && court.match_status === "pending";
  const isInProgress = !isFinishing && (optimisticStartedAt !== null || court.match_status === "in_progress");
  const players       = (court.players as unknown as CourtMatchPlayer[]) ?? [];
  const teamA          = players.filter((p) => p.team === "team_a");
  const teamB          = players.filter((p) => p.team === "team_b");
  const isTeamComplete = teamA.length === teamB.length && teamA.length + teamB.length === playersPerMatch;

  const borderClass = isFree
    ? "court-available"
    : isInProgress
    ? "court-occupied"
    : isPending
    ? "court-ready"
    : "";

  async function handleGenerate() {
    setLoadingAction("generate");
    try {
      const result = await generateMatchAction(sessionId, court.court_id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Match generated on ${court.court_name}!`);
    } catch {
      toast.error("Failed to generate match.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleStart() {
    if (!court.match_id) return;
    setLoadingAction("start");
    try {
      const result = await startMatchAction(sessionId, court.match_id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setOptimisticStartedAt(new Date().toISOString());
      toast.success(`${court.court_name} is live!`);
    } catch {
      toast.error("Failed to start match.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleFinish(winnerTeam: TeamSide) {
    if (!court.match_id) return;
    setLoadingAction(winnerTeam);
    try {
      const result = await finishMatchAction(sessionId, court.match_id, winnerTeam);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setJustFinished(true);
      toast.success(
        `${winnerTeam === "team_a" ? "Team A" : "Team B"} won! Players are back in queue.`
      );
    } catch {
      toast.error("Failed to finish match.");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <Card className={cn(borderClass)}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">{court.court_name}</h3>
          <div className="flex items-center gap-2">
            {!isFinishing && !isFree && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Edit players"
                onClick={() => onEditPlayers(court.match_id!)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {isFinishing ? (
              <span className="text-xs font-medium text-muted-foreground">Finishing…</span>
            ) : isFree ? (
              <CourtStatusBadge status="available" />
            ) : isInProgress ? (
              <TimerDisplay startedAt={court.started_at ?? optimisticStartedAt} size="sm" />
            ) : (
              <span className="rounded-full bg-accent/20 px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                Ready
              </span>
            )}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {isFinishing ? (
            <motion.div
              key="finishing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-sm text-muted-foreground py-2"
            >
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Wrapping up this match…
            </motion.div>
          ) : isFree ? (
            <motion.div
              key="available"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                {hasEnoughPlayers
                  ? `Ready — ${playersPerMatch} players waiting`
                  : `Waiting for players (need ${playersPerMatch})`}
              </div>
              <Button
                className="w-full"
                size="sm"
                disabled={!hasEnoughPlayers}
                loading={loadingAction === "generate"}
                onClick={handleGenerate}
              >
                <Zap className="h-4 w-4" />
                Generate Match
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="assigned"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Team A
                  </p>
                  {teamA.map((p) => (
                    <p key={p.player_id} className="truncate text-foreground">{p.display_name}</p>
                  ))}
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Team B
                  </p>
                  {teamB.map((p) => (
                    <p key={p.player_id} className="truncate text-foreground">{p.display_name}</p>
                  ))}
                </div>
              </div>

              {isPending && !isTeamComplete && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Needs {playersPerMatch} players, evenly split, before this can start — edit players to fix it.
                </p>
              )}

              {isPending && (
                <Button
                  className="w-full"
                  size="sm"
                  variant="warning"
                  loading={loadingAction === "start"}
                  disabled={!isTeamComplete}
                  onClick={handleStart}
                >
                  <Play className="h-4 w-4" />
                  Start Match
                </Button>
              )}

              {isInProgress && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    loading={loadingAction === "team_a"}
                    disabled={loadingAction !== null && loadingAction !== "team_a"}
                    onClick={() => handleFinish("team_a")}
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    Team A Won
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={loadingAction === "team_b"}
                    disabled={loadingAction !== null && loadingAction !== "team_b"}
                    onClick={() => handleFinish("team_b")}
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    Team B Won
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
