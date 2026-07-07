"use client";

import { useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Zap, Play, Trophy } from "lucide-react";
import { generateMatchAction, startMatchAction, finishMatchAction } from "@/actions/match.actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CourtStatusBadge } from "@/components/shared/StatusBadge";
import { TimerDisplay } from "@/components/shared/TimerDisplay";
import { cn } from "@/lib/utils/cn";
import type { CourtView } from "@/types/match.types";
import type { TeamSide } from "@/types/database.types";

interface CourtCardProps {
  sessionId:        string;
  court:             CourtView;
  hasEnoughPlayers:  boolean;
  playersPerMatch:   number;
}

interface CourtMatchPlayer {
  player_id:    string;
  display_name: string;
  team:         TeamSide;
}

type LoadingAction = "generate" | "start" | "team_a" | "team_b" | null;

export function CourtCard({ sessionId, court, hasEnoughPlayers, playersPerMatch }: CourtCardProps) {
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);

  const isFree       = court.match_id === null && court.court_status !== "maintenance";
  const isPending    = court.match_status === "pending";
  const isInProgress = court.match_status === "in_progress";
  const players       = (court.players as unknown as CourtMatchPlayer[]) ?? [];
  const teamA          = players.filter((p) => p.team === "team_a");
  const teamB          = players.filter((p) => p.team === "team_b");

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
          {isFree ? (
            <CourtStatusBadge status="available" />
          ) : isInProgress ? (
            <TimerDisplay startedAt={court.started_at} size="sm" />
          ) : (
            <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
              Ready
            </span>
          )}
        </div>

        <AnimatePresence mode="wait">
          {isFree ? (
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

              {isPending && (
                <Button
                  className="w-full"
                  size="sm"
                  variant="warning"
                  loading={loadingAction === "start"}
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
