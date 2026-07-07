import type { TypedSupabaseClient } from "@/lib/supabase/types";

type DB = TypedSupabaseClient;

interface CourtMatchPlayerRow {
  player_id: string;
}

export class CourtRepository {
  constructor(private readonly db: DB) {}

  async getCourtsWithStatus(sessionId: string) {
    const { data, error } = await this.db
      .from("court_status_view")
      .select("*")
      .eq("session_id", sessionId)
      .order("court_number", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async findActiveCourtForPlayer(sessionId: string, playerId: string) {
    const courts = await this.getCourtsWithStatus(sessionId);
    return (
      courts.find((court) => {
        if (!court.match_id) return false;
        const players = (court.players as unknown as CourtMatchPlayerRow[]) ?? [];
        return players.some((p) => p.player_id === playerId);
      }) ?? null
    );
  }
}
