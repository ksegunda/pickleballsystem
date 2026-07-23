"use client";

import { motion } from "framer-motion";
import { MapPin, PartyPopper } from "lucide-react";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { TimerDisplay } from "@/components/shared/TimerDisplay";
import { PickleballCourtGraphic } from "./PickleballCourtGraphic";
import type { CurrentMatchView } from "@/types/match.types";

interface CurrentMatchCardProps {
  match: CurrentMatchView;
}

export function CurrentMatchCard({ match }: CurrentMatchCardProps) {
  const isLive       = match.match_status === "in_progress";
  const isForecasted = match.match_status === "forecasted";
  const bottomTeam    = match.partner ? [match.me, match.partner] : [match.me];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-4"
    >
      {isForecasted && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-card"
        >
          <motion.div
            animate={{ rotate: [0, -10, 10, -10, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1.5 }}
          >
            <PartyPopper className="h-5 w-5 shrink-0" />
          </motion.div>
          <div className="min-w-0">
            <p className="text-sm font-extrabold uppercase tracking-wide">You&apos;re next up!</p>
            <p className="text-xs opacity-90">Stay nearby — waiting for a court to open up.</p>
          </div>
        </motion.div>
      )}

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

      <PickleballCourtGraphic
        topTeam={match.opponents}
        bottomTeam={bottomTeam}
        meId={match.me.player_id}
        reserved={isForecasted}
      />
    </motion.div>
  );
}
