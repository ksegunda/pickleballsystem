import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PlayerService } from "@/services/player.service";
import { PlayersRosterBoard } from "@/components/host/players/PlayersRosterBoard";

export const metadata: Metadata = { title: "Players" };

interface PageProps { params: Promise<{ sessionId: string }> }

export default async function PlayersPage({ params }: PageProps) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const service  = new PlayerService(supabase);
  const players  = await service.getLeaderboard(sessionId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Players</h1>
        <p className="text-muted-foreground">
          Everyone who has joined this session, with their live status and stats.
        </p>
      </div>
      <PlayersRosterBoard sessionId={sessionId} initialPlayers={players} />
    </div>
  );
}
