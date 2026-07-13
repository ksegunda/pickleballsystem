import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SessionService } from "@/services/session.service";
import { MatchmakingService } from "@/services/matchmaking.service";
import { CourtsBoard } from "@/components/host/courts/CourtsBoard";
import { ROUTES } from "@/lib/constants/routes";

export const metadata: Metadata = { title: "Courts" };

interface PageProps { params: Promise<{ sessionId: string }> }

export default async function CourtsPage({ params }: PageProps) {
  const { sessionId } = await params;
  const supabase = await createClient();

  const sessionService = new SessionService(supabase);
  const session = await sessionService.getSession(sessionId);
  if (session.status !== "active") {
    redirect(ROUTES.DASHBOARD(sessionId));
  }

  const service  = new MatchmakingService(supabase);
  const { courts, eligibility, forecastPool, hasManualSlot, queue } = await service.getCourtsBoard(sessionId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Courts</h1>
        <p className="text-muted-foreground">
          A match generates for any court as soon as enough players are waiting for it —
          no need to wait for the whole session to fill up.
        </p>
      </div>
      <CourtsBoard
        sessionId={sessionId}
        initialCourts={courts}
        initialEligibility={eligibility}
        initialForecastPool={forecastPool}
        initialHasManualSlot={hasManualSlot}
        initialQueue={queue}
      />
    </div>
  );
}
