import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SessionService } from "@/services/session.service";
import { MatchmakingService } from "@/services/matchmaking.service";
import { MatchHistoryBoard } from "@/components/host/matches/MatchHistoryBoard";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = { title: "Match History" };

interface PageProps { params: Promise<{ sessionId: string }> }

export default async function MatchHistoryPage({ params }: PageProps) {
  const { sessionId } = await params;
  const supabase = await createClient();

  const sessionService = new SessionService(supabase);
  const session = await sessionService.getSession(sessionId);
  if (session.status !== "active") {
    redirect(ROUTES.DASHBOARD(sessionId));
  }

  const service = new MatchmakingService(supabase);
  const rows    = await service.getMatchHistory(sessionId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Match History</h1>
        <p className="text-muted-foreground">
          Every finished match this session, most recent first.
        </p>
      </div>
      <MatchHistoryBoard sessionId={sessionId} initialRows={rows} />
    </div>
  );
}
