import type { Metadata } from "next";
import Link from "next/link";
import { Users, Activity, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SessionService } from "@/services/session.service";
import { PlayerService } from "@/services/player.service";
import { MatchmakingService } from "@/services/matchmaking.service";
import { Button } from "@/components/ui/button";
import { SessionStatusBadge } from "@/components/shared/StatusBadge";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { QRCodeDisplay } from "@/components/host/session/QRCodeDisplay";
import { JoinCodeDisplay } from "@/components/host/session/JoinCodeDisplay";
import { StartSessionButton } from "@/components/host/session/StartSessionButton";
import { EndSessionButton } from "@/components/host/session/EndSessionButton";
import { DashboardStats } from "@/components/host/session/DashboardStats";
import { OverviewSummary } from "@/components/host/session/OverviewSummary";
import { formatDate, formatTime } from "@/lib/utils/format";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = { title: "Dashboard" };

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function DashboardPage({ params }: PageProps) {
  const { sessionId } = await params;
  const supabase = await createClient();

  const sessionService = new SessionService(supabase);
  const playerService  = new PlayerService(supabase);

  const [session, summary, players] = await Promise.all([
    sessionService.getSession(sessionId),
    sessionService.getSessionSummary(sessionId).catch(() => null),
    playerService.getSessionPlayers(sessionId),
  ]);

  const isActive  = session.status === "active";
  const isPending = session.status === "pending";

  // Courts/queue/leaderboard only exist once the session is active — skip
  // fetching them for a pending session with no courts yet.
  let overviewBoard: Awaited<ReturnType<MatchmakingService["getCourtsBoard"]>> | null = null;
  let leaderboard: Awaited<ReturnType<PlayerService["getLeaderboard"]>> = [];

  if (isActive) {
    const matchmakingService = new MatchmakingService(supabase);
    [overviewBoard, leaderboard] = await Promise.all([
      matchmakingService.getCourtsBoard(sessionId),
      playerService.getLeaderboard(sessionId),
    ]);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Session header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-foreground">{session.session_name}</h1>
            <SessionStatusBadge status={session.status} />
            {isActive && <LiveIndicator />}
          </div>
          <p className="text-muted-foreground">
            {session.club_name} · {formatDate(session.session_date)} · {formatTime(session.start_time)}
            {session.end_time ? ` – ${formatTime(session.end_time)}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isPending && (
            <StartSessionButton sessionId={sessionId} />
          )}
          {isActive && (
            <>
              <Button variant="outline" asChild>
                <Link href={ROUTES.COURTS(sessionId)}>
                  <Activity className="h-4 w-4" />
                  Manage Courts
                </Link>
              </Button>
              <EndSessionButton sessionId={sessionId} />
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <DashboardStats
        sessionId={sessionId}
        session={session}
        initialSummary={summary}
        playersFallback={players.length}
      />

      {/* QR code + join code — always shown together so the code stays a
          working fallback even if QR generation ever fails again */}
      <div className="flex flex-wrap gap-4">
        <div className="w-full max-w-sm sm:w-auto">
          <QRCodeDisplay sessionId={sessionId} joinCode={session.join_code} />
        </div>
        <div className="w-full max-w-sm sm:w-auto">
          <JoinCodeDisplay sessionId={sessionId} joinCode={session.join_code} />
        </div>
      </div>

      {/* Live overview: court assignments, next up, queue, leaderboard */}
      {isActive && overviewBoard && (
        <OverviewSummary
          sessionId={sessionId}
          initialCourts={overviewBoard.courts}
          initialForecastPool={overviewBoard.forecastPool}
          initialManualSlot={overviewBoard.manualSlot}
          initialQueue={overviewBoard.queue}
          initialLeaderboard={leaderboard}
          playersPerMatch={overviewBoard.eligibility.playersPerMatch}
        />
      )}

      {/* Quick links */}
      {isActive && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { label: "Courts",      href: ROUTES.COURTS(sessionId),      icon: Activity },
            { label: "Players",     href: ROUTES.PLAYERS(sessionId),     icon: Users },
            { label: "Leaderboard", href: ROUTES.LEADERBOARD(sessionId), icon: Trophy },
          ].map((link) => (
            <Button key={link.label} variant="outline" className="h-auto flex-col gap-2 py-4" asChild>
              <Link href={link.href}>
                <link.icon className="h-5 w-5" />
                <span className="text-xs font-medium">{link.label}</span>
              </Link>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
