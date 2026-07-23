"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";
import type { MatchPlayerView } from "@/types/match.types";

interface PickleballCourtGraphicProps {
  topTeam:    MatchPlayerView[];
  bottomTeam: MatchPlayerView[];
  meId:       string;
  // Forecasted (Next Up) sets don't have a real court yet — dims the
  // markings so the graphic reads as "not real yet" rather than implying
  // players are already standing on a numbered court. A match that's
  // pending (promoted to a real court, host just hasn't hit Start) stays
  // full-bright, since that one's the real thing already.
  reserved?: boolean;
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

function PlayerChip({ player, isMe }: { player: MatchPlayerView; isMe: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <Avatar className={cn("h-11 w-11 shadow-card", isMe && "ring-2 ring-white")}>
        <AvatarFallback
          className={cn(
            "text-[13px] font-extrabold",
            isMe ? "bg-primary text-primary-foreground" : "bg-white/95 text-foreground"
          )}
        >
          {initials(player.display_name)}
        </AvatarFallback>
      </Avatar>
      <p className="max-w-[72px] truncate text-[11px] font-bold text-white [text-shadow:0_1px_3px_rgb(0_0_0_/_0.45)]">
        {player.display_name}
      </p>
      {isMe && (
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
export function PickleballCourtGraphic({ topTeam, bottomTeam, meId, reserved }: PickleballCourtGraphicProps) {
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

      <div className="absolute inset-0 grid grid-rows-[1fr_auto_1fr] p-3.5">
        <div className={cn("grid content-start gap-2", topTeam.length === 1 ? "grid-cols-1 justify-items-center" : "grid-cols-2")}>
          {topTeam.map((p) => (
            <PlayerChip key={p.player_id} player={p} isMe={p.player_id === meId} />
          ))}
        </div>
        <div className="flex items-center justify-center">
          <span className="rounded-full bg-white/95 px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wide text-foreground shadow">
            Net
          </span>
        </div>
        <div className={cn("grid content-end gap-2", bottomTeam.length === 1 ? "grid-cols-1 justify-items-center" : "grid-cols-2")}>
          {bottomTeam.map((p) => (
            <PlayerChip key={p.player_id} player={p} isMe={p.player_id === meId} />
          ))}
        </div>
      </div>
    </div>
  );
}
