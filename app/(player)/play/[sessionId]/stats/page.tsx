import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SessionService } from "@/services/session.service";
import { PlayerStatsView } from "@/components/player/stats/PlayerStatsView";

export const metadata: Metadata = { title: "My Stats" };

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function PlayerStatsPage({ params }: PageProps) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const service  = new SessionService(supabase);

  const session = await service.getSession(sessionId).catch(() => null);
  if (!session) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="text-center">
          <p className="text-lg font-semibold">Session not found</p>
          <p className="text-sm text-muted-foreground mt-1">This session may have ended.</p>
        </div>
      </div>
    );
  }

  return <PlayerStatsView session={session} />;
}
