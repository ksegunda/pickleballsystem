import { forwardRef } from "react";

export interface ShareCardPlayer {
  rank: number;
  name: string;
  wins: number;
}

interface LeaderboardShareCardProps {
  clubName:     string;
  sessionName:  string;
  dateLabel:    string;
  totalPlayers: number;
  top:          ShareCardPlayer[];
  // Only rendered when the sharing player isn't already in `top` — no
  // point telling someone "you're #1" a second time.
  you?: { rank: number; name: string } | null;
}

const MEDALS = ["🥇", "🥈", "🥉"];

// Rendered off-screen at its real 1080x1080 output size (not scaled up
// later) so every measurement in here matches the final PNG 1:1 — see
// LeaderboardShareCardTrigger for why: html2canvas captures this exact
// DOM node, so what's laid out here is exactly what gets shared.
export const LeaderboardShareCard = forwardRef<HTMLDivElement, LeaderboardShareCardProps>(
  function LeaderboardShareCard({ clubName, sessionName, dateLabel, totalPlayers, top, you }, ref) {
    return (
      <div
        ref={ref}
        style={{ width: 1080, height: 1080 }}
        className="flex flex-col bg-gradient-to-br from-primary via-secondary to-[#1c3a52] p-[64px] text-white"
      >
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- captured by html2canvas, not a normal page image */}
          <img src="/icon.png" alt="" className="h-[64px] w-[64px] rounded-[18px]" />
          <span className="text-[34px] font-extrabold tracking-tight">PaddleSync</span>
        </div>

        <div className="mt-[44px]">
          <p className="text-[22px] font-bold uppercase tracking-[0.08em] opacity-75">{clubName}</p>
          <p className="mt-[6px] text-[46px] font-extrabold leading-tight">{sessionName}</p>
          <p className="mt-[6px] text-[22px] opacity-70">{dateLabel} · {totalPlayers} players</p>
        </div>

        <div className="mt-[48px] flex flex-1 flex-col gap-[20px]">
          {top.map((p, i) => (
            <div
              key={p.rank}
              // Plain rgba(), not the bg-white/15 Tailwind utility — Tailwind
              // 3.4 compiles opacity modifiers on non-alpha-aware colors
              // (white here) to the modern `rgb(r g b / a)` space syntax,
              // which html2canvas 1.4's color parser can't read and throws
              // on. This is what was actually causing "Could not generate
              // the share image" — the whole capture aborted on this one
              // background-color.
              style={{ backgroundColor: "rgba(255, 255, 255, 0.15)" }}
              className="flex items-center gap-[24px] rounded-[28px] px-[28px] py-[22px]"
            >
              <span className="w-[56px] text-center text-[42px] leading-none">{MEDALS[i] ?? p.rank}</span>
              <span className="flex-1 truncate text-[30px] font-bold">{p.name}</span>
              <span className="text-[28px] font-extrabold tabular-nums">{p.wins} wins</span>
            </div>
          ))}
        </div>

        {you && (
          <div className="mt-[20px] flex items-center justify-between rounded-[28px] bg-white px-[32px] py-[24px] text-[#16324a]">
            <span className="text-[26px] font-bold">{you.name}&apos;s rank</span>
            <span className="text-[32px] font-extrabold">#{you.rank} of {totalPlayers}</span>
          </div>
        )}

        <p className="mt-[36px] text-center text-[20px] tracking-[0.03em] opacity-65">paddlesync.app</p>
      </div>
    );
  }
);
