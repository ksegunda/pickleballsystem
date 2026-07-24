import { forwardRef } from "react";

export interface ShareCardPlayer {
  rank: number;
  name: string;
  wins: number;
}

interface LeaderboardShareCardProps {
  clubName:      string;
  sessionName:   string;
  dateLabel:     string;
  totalPlayers:  number;
  totalGames:    number | string;
  totalCourts:   number | string;
  // The host's own uploaded club logo — distinct from the PaddleSync app
  // icon. Null when the host hasn't uploaded one; that row of the header
  // just doesn't render then.
  hostAvatarUrl: string | null;
  // Exactly the top 3 (or fewer, for a very small session) — the podium.
  podium:        ShareCardPlayer[];
  // Ranks 4-5, shown as a compact list below the podium if there's room.
  more:          ShareCardPlayer[];
  // Only set when the sharing player isn't already on the podium or in
  // `more` — no point telling someone "you're #1" a second time.
  you?: { rank: number; name: string } | null;
}

// Literal hex throughout this whole file — deliberately NOT Tailwind color
// utilities or hsl(var(--x)). Even a plain `text-white` with no opacity
// modifier compiles to `rgb(r g b / var(--tw-text-opacity, 1))`, and
// gradient from-*/via-* utilities emit `hsl(var(--x) / 0)` fade stops —
// both are modern CSS Color 4 slash-alpha syntax that html2canvas's color
// parser can't read, and it aborts the WHOLE capture on the first one it
// hits (this is what broke the Share feature twice already). This card
// doesn't need theme reactivity anyway, so plain hex sidesteps the entire
// class of bug instead of chasing it one class at a time.
const BRAND = {
  primary:   "#2b6fab",
  secondary: "#2b72a1",
  navy:      "#1c3a52",
  white:     "#ffffff",
  darkText:  "#16324a",
  cream:     "#f9e8a2",
};

interface MedalColors {
  badge:  string;
  top:    string;
  bottom: string;
  text:   string;
}

const MEDAL: Record<"gold" | "silver" | "bronze", MedalColors> = {
  gold:   { badge: "#f5c542", top: "#ffdb7a", bottom: "#d99a1f", text: "#5c3d00" },
  silver: { badge: "#cdd6de", top: "#eef2f5", bottom: "#aeb9c2", text: "#333e47" },
  bronze: { badge: "#cf8a4e", top: "#e3ac78", bottom: "#a9622c", text: "#3a2000" },
};

function PodiumBlock({
  rank, name, wins, height, medal,
}: {
  rank:   1 | 2 | 3;
  name:   string;
  wins:   number;
  height: number;
  medal:  MedalColors;
}) {
  return (
    <div className="flex flex-col items-center" style={{ width: 300 }}>
      <div
        style={{
          width: 84, height: 84, borderRadius: 9999,
          backgroundColor: medal.badge,
          color: medal.text,
          border: `5px solid ${BRAND.white}`,
          boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
          marginBottom: -22,
          zIndex: 2,
        }}
        className="relative flex items-center justify-center text-[38px] font-extrabold"
      >
        {rank}
      </div>
      <div
        style={{
          width: "100%",
          height,
          backgroundImage: `linear-gradient(180deg, ${medal.top}, ${medal.bottom})`,
          borderRadius: "28px 28px 0 0",
          color: medal.text,
          boxShadow: "0 -6px 20px rgba(0,0,0,0.18)",
        }}
        className="flex flex-col items-center px-[12px] pt-[38px]"
      >
        <p className="max-w-full truncate text-[26px] font-extrabold">{name}</p>
        <p className="mt-[4px] text-[19px] font-bold" style={{ opacity: 0.8 }}>{wins} wins</p>
      </div>
    </div>
  );
}

function MoreRow({ entry }: { entry: ShareCardPlayer }) {
  return (
    <div
      style={{ backgroundColor: "rgba(255, 255, 255, 0.12)" }}
      className="flex items-center gap-[16px] rounded-[18px] px-[22px] py-[13px]"
    >
      <span className="w-[32px] text-center text-[20px] font-extrabold" style={{ opacity: 0.85 }}>{entry.rank}</span>
      <span className="flex-1 truncate text-[20px] font-bold">{entry.name}</span>
      <span className="text-[18px] font-extrabold tabular-nums" style={{ opacity: 0.85 }}>{entry.wins} wins</span>
    </div>
  );
}

// Rendered off-screen at its real 1080x1080 output size (not scaled up
// later) so every measurement in here matches the final PNG 1:1 — see
// PlayerLeaderboardView's handleShare: html2canvas captures this exact
// DOM node, so what's laid out here is exactly what gets shared.
export const LeaderboardShareCard = forwardRef<HTMLDivElement, LeaderboardShareCardProps>(
  function LeaderboardShareCard(
    { clubName, sessionName, dateLabel, totalPlayers, totalGames, totalCourts, hostAvatarUrl, podium, more, you },
    ref
  ) {
    const first  = podium.find((p) => p.rank === 1);
    const second = podium.find((p) => p.rank === 2);
    const third  = podium.find((p) => p.rank === 3);

    return (
      <div
        ref={ref}
        style={{
          width: 1080,
          height: 1080,
          backgroundImage: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary}, ${BRAND.navy})`,
          color: BRAND.white,
        }}
        className="flex flex-col p-[60px]"
      >
        {/* Attribution — small, de-emphasized. The club is the star of this card. */}
        <div className="flex items-center gap-[8px]" style={{ opacity: 0.75 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- captured by html2canvas, not a normal page image */}
          <img src="/icon.png" alt="" crossOrigin="anonymous" style={{ width: 22, height: 22, borderRadius: 6 }} />
          <span className="text-[15px] font-bold uppercase tracking-[0.08em]">Powered by PaddleSync</span>
        </div>

        {/* Club identity */}
        <div className="mt-[20px] flex items-center gap-[20px]">
          {hostAvatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hostAvatarUrl}
              alt=""
              crossOrigin="anonymous"
              style={{ width: 72, height: 72, borderRadius: 20, objectFit: "cover", flexShrink: 0 }}
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-[38px] font-extrabold leading-tight">{clubName}</p>
            <p className="mt-[2px] truncate text-[23px] font-semibold" style={{ opacity: 0.85 }}>{sessionName}</p>
          </div>
        </div>

        <p className="mt-[14px] text-[19px]" style={{ opacity: 0.7 }}>
          {dateLabel} · {totalPlayers} players · {totalGames} games · {totalCourts} courts
        </p>

        {/* Podium */}
        <div className="mt-[46px] flex items-end justify-center gap-[24px]">
          {second && <PodiumBlock rank={2} name={second.name} wins={second.wins} height={200} medal={MEDAL.silver} />}
          {first  && <PodiumBlock rank={1} name={first.name}  wins={first.wins}  height={280} medal={MEDAL.gold} />}
          {third  && <PodiumBlock rank={3} name={third.name}  wins={third.wins}  height={155} medal={MEDAL.bronze} />}
        </div>

        {more.length > 0 && (
          <div className="mt-[36px] flex flex-col gap-[10px]">
            {more.map((entry) => <MoreRow key={entry.rank} entry={entry} />)}
          </div>
        )}

        {you && (
          <div
            style={{ backgroundColor: BRAND.white, color: BRAND.darkText }}
            className="mt-auto flex items-center justify-between rounded-[24px] px-[28px] py-[20px]"
          >
            <span className="text-[22px] font-bold">{you.name}&apos;s rank</span>
            <span className="text-[27px] font-extrabold">#{you.rank} of {totalPlayers}</span>
          </div>
        )}

        <p className={you ? "mt-[18px]" : "mt-auto"} style={{ opacity: 0.6 }}>
          <span className="block text-center text-[17px] tracking-[0.03em]">paddlesync.app</span>
        </p>
      </div>
    );
  }
);
