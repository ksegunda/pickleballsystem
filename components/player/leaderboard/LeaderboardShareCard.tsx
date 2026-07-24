import { forwardRef } from "react";

export interface ShareCardPlayer {
  rank:    number;
  name:    string;
  wins:    number;
  losses:  number;
  winRate: number;
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
// utilities or hsl(var(--x)), and no CSS `filter` (blur/drop-shadow) either.
// Even a plain `text-white` with no opacity modifier compiles to
// `rgb(r g b / var(--tw-text-opacity, 1))`, and gradient from-*/via-*
// utilities emit `hsl(var(--x) / 0)` fade stops — both are modern CSS
// Color 4 slash-alpha syntax that html2canvas's color parser can't read,
// and it aborts the WHOLE capture on the first one it hits (this is what
// broke Share twice already). `filter` is a separate, also-real risk —
// html2canvas has historically had weak/no support for it — so the
// decorative background glow below uses radial-gradient (a background
// image, fully supported, same mechanism as the main gradient) instead
// of a blurred shape. This card doesn't need theme reactivity anyway, so
// plain hex + gradients sidestep the entire class of bug.
const BRAND = {
  primary:   "#2b6fab",
  secondary: "#2b72a1",
  navy:      "#1c3a52",
  white:     "#ffffff",
  darkText:  "#16324a",
  cream:     "#f9e8a2",
  aqua:      "#b4e1eb",
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
  rank, name, wins, losses, winRate, height, medal,
}: {
  rank:    1 | 2 | 3;
  name:    string;
  wins:    number;
  losses:  number;
  winRate: number;
  height:  number;
  medal:   MedalColors;
}) {
  return (
    <div className="flex flex-col items-center" style={{ width: 310 }}>
      <div
        style={{
          width: 92, height: 92, borderRadius: 9999,
          backgroundColor: medal.badge,
          color: medal.text,
          border: `5px solid ${BRAND.white}`,
          boxShadow: "0 6px 18px rgba(0,0,0,0.28)",
          marginBottom: -24,
          zIndex: 2,
        }}
        className="relative flex items-center justify-center text-[42px] font-extrabold"
      >
        {rank}
      </div>
      <div
        style={{
          width: "100%",
          height,
          backgroundImage: `linear-gradient(180deg, ${medal.top}, ${medal.bottom})`,
          borderRadius: "30px 30px 0 0",
          color: medal.text,
          boxShadow: "0 -6px 22px rgba(0,0,0,0.2)",
        }}
        className="flex flex-col items-center px-[14px] pt-[44px]"
      >
        {/* Explicit pixel line-heights + generous margins throughout this
            stack, not Tailwind's relative "leading" utilities — same
            reasoning as the club/session name fix: html2canvas measures
            and draws text itself (canvas fillText()) rather than through
            the browser's real text layout pipeline, and a relative
            line-height + a small margin that's provably correct in a
            normal browser still isn't safe here. */}
        <p className="max-w-full truncate text-[26px] font-extrabold" style={{ lineHeight: "30px" }}>{name}</p>
        {/* Win rate is the hero stat — biggest text in the block — with the
            W-L record as small supporting text underneath, same hierarchy
            as the on-screen leaderboard row. */}
        <p className="text-[34px] font-extrabold tabular-nums" style={{ lineHeight: "38px", marginTop: "14px" }}>{winRate}%</p>
        <p className="text-[17px] font-semibold" style={{ opacity: 0.8, lineHeight: "20px", marginTop: "10px" }}>{wins}W - {losses}L</p>
      </div>
    </div>
  );
}

function MoreRow({ entry }: { entry: ShareCardPlayer }) {
  return (
    <div
      style={{ backgroundColor: "rgba(255, 255, 255, 0.12)" }}
      className="flex items-center gap-[16px] rounded-[18px] px-[24px] py-[15px]"
    >
      <span className="w-[32px] text-center text-[21px] font-extrabold" style={{ opacity: 0.85 }}>{entry.rank}</span>
      <span className="flex-1 truncate text-[21px] font-bold">{entry.name}</span>
      <div className="text-right">
        <p className="text-[20px] font-extrabold tabular-nums" style={{ lineHeight: "22px" }}>{entry.winRate}%</p>
        <p className="text-[13px] font-semibold" style={{ opacity: 0.75, lineHeight: "16px", marginTop: "8px" }}>{entry.wins}W - {entry.losses}L</p>
      </div>
    </div>
  );
}

// Two soft radial-gradient "glows" plus a faint dot-grid — decorative
// texture using only background-image (gradients), never CSS `filter`.
// Sits behind the real content via z-index, clipped to the card by the
// root's overflow:hidden.
function BackgroundDecoration() {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
      <div
        style={{
          position: "absolute", top: -140, right: -120, width: 560, height: 560, borderRadius: 9999,
          // Classic rgba() comma syntax, not an 8-digit hex alpha suffix —
          // regex-based color parsers (html2canvas included) support this
          // far more consistently than #RRGGBBAA.
          backgroundImage: "radial-gradient(circle, rgba(249, 232, 162, 0.07) 0%, rgba(249, 232, 162, 0) 70%)",
        }}
      />
      <div
        style={{
          position: "absolute", bottom: -160, left: -140, width: 520, height: 520, borderRadius: 9999,
          backgroundImage: "radial-gradient(circle, rgba(180, 225, 235, 0.06) 0%, rgba(180, 225, 235, 0) 70%)",
        }}
      />
      <div
        style={{
          position: "absolute", top: 300, left: -80, width: 300, height: 300, borderRadius: 9999,
          backgroundImage: "radial-gradient(circle, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0) 70%)",
        }}
      />
      <div
        style={{
          position: "absolute", inset: 0,
          backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1.5px, transparent 1.5px)",
          backgroundSize: "32px 32px",
        }}
      />
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
          position: "relative",
          overflow: "hidden",
          backgroundImage: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary}, ${BRAND.navy})`,
          color: BRAND.white,
        }}
      >
        <BackgroundDecoration />

        <div style={{ position: "relative", zIndex: 1 }} className="flex h-full flex-col p-[80px]">
          {/* Attribution — small, de-emphasized. The club is the star of this card. */}
          <div className="flex items-center gap-[10px]" style={{ opacity: 0.75 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- captured by html2canvas, not a normal page image */}
            <img src="/icon.png" alt="" crossOrigin="anonymous" style={{ width: 30, height: 30, borderRadius: 8 }} />
            <span className="text-[16px] font-bold uppercase tracking-[0.08em]">Powered by PaddleSync</span>
          </div>

          {/* Club identity */}
          <div className="mt-[28px] flex items-center gap-[24px]">
            {hostAvatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hostAvatarUrl}
                alt=""
                crossOrigin="anonymous"
                style={{ width: 94, height: 94, borderRadius: 24, objectFit: "cover", flexShrink: 0, boxShadow: "0 6px 18px rgba(0,0,0,0.25)" }}
              />
            )}
            <div className="min-w-0">
              {/* Explicit pixel line-height (not Tailwind's relative
                  `leading-tight`) plus a generously large marginTop —
                  html2canvas does its own text layout/measurement via
                  canvas fillText() rather than the browser's native text
                  pipeline, and doesn't reliably reproduce CSS line-height
                  the way a real rendered page does. A relative unit +
                  small margin genuinely wasn't safe here, even though the
                  math checks out in a normal browser. */}
              <p className="truncate text-[44px] font-extrabold" style={{ lineHeight: "52px" }}>{clubName}</p>
              <p
                className="truncate text-[25px] font-semibold"
                style={{ opacity: 0.85, lineHeight: "32px", marginTop: "38px" }}
              >
                {sessionName}
              </p>
            </div>
          </div>

          <p className="mt-[20px] text-[20px]" style={{ opacity: 0.7 }}>
            {dateLabel} · {totalPlayers} players · {totalGames} games · {totalCourts} courts
          </p>

          {/* Podium */}
          <div className="mt-[72px] flex items-end justify-center gap-[28px]">
            {second && <PodiumBlock rank={2} name={second.name} wins={second.wins} losses={second.losses} winRate={second.winRate} height={230} medal={MEDAL.silver} />}
            {first  && <PodiumBlock rank={1} name={first.name}  wins={first.wins}  losses={first.losses}  winRate={first.winRate}  height={320} medal={MEDAL.gold} />}
            {third  && <PodiumBlock rank={3} name={third.name}  wins={third.wins}  losses={third.losses}  winRate={third.winRate}  height={175} medal={MEDAL.bronze} />}
          </div>

          {more.length > 0 && (
            <div className="mt-[48px] flex flex-col gap-[12px]">
              {more.map((entry) => <MoreRow key={entry.rank} entry={entry} />)}
            </div>
          )}

          {you && (
            <div
              style={{ backgroundColor: BRAND.white, color: BRAND.darkText }}
              className="mt-auto flex items-center justify-between rounded-[24px] px-[30px] py-[22px]"
            >
              <span className="text-[23px] font-bold">{you.name}&apos;s rank</span>
              <span className="text-[28px] font-extrabold">#{you.rank} of {totalPlayers}</span>
            </div>
          )}

          <p className={you ? "mt-[20px]" : "mt-auto"} style={{ opacity: 0.6 }}>
            <span className="block text-center text-[18px] tracking-[0.03em]">paddlesync.app</span>
          </p>
        </div>
      </div>
    );
  }
);
