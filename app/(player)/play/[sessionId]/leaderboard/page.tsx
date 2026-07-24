import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SessionService } from "@/services/session.service";
import { PlayerLeaderboardView } from "@/components/player/leaderboard/PlayerLeaderboardView";

export const metadata: Metadata = { title: "Leaderboard" };

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function PlayerLeaderboardPage({ params }: PageProps) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const service  = new SessionService(supabase);

  const [session, summary, branding] = await Promise.all([
    service.getSession(sessionId).catch(() => null),
    service.getSessionSummary(sessionId).catch(() => undefined),
    service.getSessionBranding(sessionId).catch(() => null),
  ]);
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

  return (
    <PlayerLeaderboardView
      session={{ ...session, summary }}
      hostAvatarUrl={branding?.host_avatar_url ?? null}
    />
  );
}
