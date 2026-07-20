"use client";

import { motion } from "framer-motion";
import { MapPin, Swords } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { TimerDisplay } from "@/components/shared/TimerDisplay";
import { cn } from "@/lib/utils/cn";
import type { CurrentMatchView, MatchPlayerView } from "@/types/match.types";

interface CurrentMatchCardProps {
  match: CurrentMatchView;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function PlayerRow({ player, highlight }: { player: MatchPlayerView; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-11 w-11">
        <AvatarFallback className={highlight ? "bg-primary text-primary-foreground" : undefined}>
          {initials(player.display_name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">
          {player.display_name}
          {highlight && <span className="ml-1.5 text-xs font-medium text-primary">(You)</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          {player.win_rate}% win rate · {player.games_played} games
        </p>
      </div>
    </div>
  );
}

export function CurrentMatchCard({ match }: CurrentMatchCardProps) {
  const isLive       = match.match_status === "in_progress";
  const isForecasted = match.match_status === "forecasted";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-4"
    >
      {/* Court header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-accent-foreground" />
          <span className="font-semibold text-foreground">
            {isForecasted ? "Upcoming match" : match.court_name}
          </span>
        </div>
        {isLive ? (
          <div className="flex items-center gap-2">
            <LiveIndicator size="sm" />
            <TimerDisplay startedAt={match.started_at} size="sm" />
          </div>
        ) : (
          <span className="rounded-full bg-accent/20 px-2.5 py-1 text-xs font-semibold text-accent-foreground">
            {isForecasted ? "Reserved" : "Get ready"}
          </span>
        )}
      </div>

      {isForecasted && (
        <p className="text-sm text-muted-foreground">
          You&apos;ve been matched! Waiting for a court to open up.
        </p>
      )}

      {/* Team A — you */}
      <Card className={cn("border-2 border-primary/30 bg-primary/5")}>
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Your Team</p>
          <PlayerRow player={match.me} highlight />
          {match.partner && <PlayerRow player={match.partner} />}
        </CardContent>
      </Card>

      {/* VS divider */}
      <div className="flex items-center justify-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white shadow-card">
          <Swords className="h-4 w-4" />
        </div>
      </div>

      {/* Team B — opponents */}
      <Card className="border-2 border-border bg-muted/30">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Opponents</p>
          {match.opponents.map((p) => (
            <PlayerRow key={p.player_id} player={p} />
          ))}
        </CardContent>
      </Card>
    </motion.div>
  );
}
