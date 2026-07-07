import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SessionService } from "@/services/session.service";
import { PlayerService } from "@/services/player.service";
import { LeaderboardBoard } from "@/components/host/leaderboard/LeaderboardBoard";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = { title: "Leaderboard" };

interface PageProps { params: Promise<{ sessionId: string }> }

export default async function LeaderboardPage({ params }: PageProps) {
  const { sessionId } = await params;
  const supabase = await createClient();

  const sessionService = new SessionService(supabase);
  const session = await sessionService.getSession(sessionId);
  if (session.status !== "active") {
    redirect(ROUTES.DASHBOARD(sessionId));
  }

  const service  = new PlayerService(supabase);
  const players  = await service.getLeaderboard(sessionId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Leaderboard</h1>
        <p className="text-muted-foreground">
          Ranked by wins, then win rate, then games played.
        </p>
      </div>
      <LeaderboardBoard sessionId={sessionId} initialPlayers={players} />
    </div>
  );
}
