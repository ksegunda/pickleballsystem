"use client";

import type { ReactNode } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";

// Only what the graphic actually renders — an avatar initial and a name.
// MatchPlayerView (Play tab) and the plain court_status_view player rows
// (Courts tab) both satisfy this without either needing to reshape.
interface CourtPlayer {
  player_id:    string;
  display_name: string;
}

interface PickleballCourtGraphicProps {
  topTeam:    CourtPlayer[];
  bottomTeam: CourtPlayer[];
  meId:       string;
  // Forecasted (Next Up) sets don't have a real court yet — dims the
  // markings so the graphic reads as "not real yet" rather than implying
  // players are already standing on a numbered court. A match that's
  // pending (promoted to a real court, host just hasn't hit Start) stays
  // full-bright, since that one's the real thing already.
  reserved?: boolean;
  // Smaller avatars/text for the multi-court grid (Courts tab), where many
  // of these render at once — the single-match Play tab never sets this,
  // so its sizing is unchanged.
  compact?: boolean;
  // Optional label/status bar overlaid on the graphic itself (court name +
  // live timer, for the Courts tab's many-cards-at-once grid) instead of a
  // separate header row above it. Play tab's CurrentMatchCard keeps its
  // own header row and never passes this.
  header?: ReactNode;
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

function PlayerChip({ player, isMe, compact }: { player: CourtPlayer; isMe: boolean; compact?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <Avatar className={cn(compact ? "h-7 w-7" : "h-11 w-11", "shadow-card", isMe && "ring-2 ring-white")}>
        <AvatarFallback
          className={cn(
            compact ? "text-[9.5px]" : "text-[13px]",
            "font-extrabold",
            isMe ? "bg-primary text-primary-foreground" : "bg-white/95 text-foreground"
          )}
        >
          {initials(player.display_name)}
        </AvatarFallback>
      </Avatar>
      <p
        className={cn(
          compact ? "text-[8.5px]" : "text-[11px]",
          "w-full truncate font-bold text-white [text-shadow:0_1px_3px_rgb(0_0_0_/_0.45)]"
        )}
      >
        {player.display_name}
      </p>
      {isMe && !compact && (
        <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[8.5px] font-bold tracking-wide text-white">
          You
        </span>
      )}
    </div>
  );
}

// Purely decorative SVG background — court markings only, no player data
// inside it. Real-court proportions: net at the vertical midline, kitchen
// lines set 31.8% of each half's depth from the net (the actual 7ft / 22ft
// non-volley-zone ratio on a regulation 44x20 court), center service lines
// that stop at the kitchen line rather than crossing it. viewBox scaling
// keeps every line crisp at any phone width without raster assets.
//
// Player chips are regular HTML laid over the SVG via the grid below, not
// SVG text — names truncate/wrap/localize normally this way instead of
// fighting SVG's text layout model.
export function PickleballCourtGraphic({ topTeam, bottomTeam, meId, reserved, compact, header }: PickleballCourtGraphicProps) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl bg-secondary shadow-card-lg"
      style={{ aspectRatio: "300 / 400" }}
    >
      <svg
        viewBox="0 0 300 400"
        preserveAspectRatio="xMidYMid meet"
        className={cn("absolute inset-0 h-full w-full transition-opacity duration-300", reserved && "opacity-60")}
      >
        <rect x="0" y="0" width="300" height="200" fill="#000" opacity="0.08" />
        <rect x="20" y="16" width="260" height="368" fill="none" stroke="#fff" strokeWidth="3" />
        <rect x="20" y="16" width="260" height="126" fill="#fff" opacity="0.07" />
        <rect x="20" y="258" width="260" height="126" fill="#fff" opacity="0.07" />
        <line x1="20" y1="142" x2="280" y2="142" stroke="#fff" strokeWidth="2.5" />
        <line x1="20" y1="258" x2="280" y2="258" stroke="#fff" strokeWidth="2.5" />
        <line x1="150" y1="16" x2="150" y2="142" stroke="#fff" strokeWidth="2" />
        <line x1="150" y1="258" x2="150" y2="384" stroke="#fff" strokeWidth="2" />
        <rect x="12" y="192" width="8" height="16" rx="2" fill="#1f2937" />
        <rect x="280" y="192" width="8" height="16" rx="2" fill="#1f2937" />
        <rect x="20" y="196" width="260" height="8" fill="#1f2937" opacity="0.85" />
        <line x1="24" y1="200" x2="276" y2="200" stroke="#fff" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
      </svg>

      {header && (
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-2">
          {header}
        </div>
      )}

      <div
        className={cn(
          "absolute inset-0 grid grid-rows-[1fr_auto_1fr]",
          compact ? "p-1.5" : "p-3.5",
          header && (compact ? "pt-6" : "pt-9")
        )}
      >
        <div className={cn("grid content-start", compact ? "gap-1" : "gap-2", topTeam.length === 1 ? "grid-cols-1 justify-items-center" : "grid-cols-2")}>
          {topTeam.map((p) => (
            <PlayerChip key={p.player_id} player={p} isMe={p.player_id === meId} compact={compact} />
          ))}
        </div>
        <div className="flex items-center justify-center">
          <span
            className={cn(
              "rounded-full bg-white/95 font-extrabold uppercase tracking-wide text-foreground shadow",
              compact ? "px-2 py-0.5 text-[7px]" : "px-2.5 py-1 text-[9.5px]"
            )}
          >
            Net
          </span>
        </div>
        <div className={cn("grid content-end", compact ? "gap-1" : "gap-2", bottomTeam.length === 1 ? "grid-cols-1 justify-items-center" : "grid-cols-2")}>
          {bottomTeam.map((p) => (
            <PlayerChip key={p.player_id} player={p} isMe={p.player_id === meId} compact={compact} />
          ))}
        </div>
      </div>
    </div>
  );
}
