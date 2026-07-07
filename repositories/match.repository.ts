import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { TeamSide } from "@/types/database.types";

type DB = TypedSupabaseClient;

export class MatchRepository {
  constructor(private readonly db: DB) {}

  async generate(sessionId: string, courtId?: string): Promise<string | null> {
    const { data, error } = await this.db.rpc("generate_match", {
      p_session_id: sessionId,
      ...(courtId ? { p_court_id: courtId } : {}),
    });
    if (error) throw error;
    return data ?? null;
  }

  async start(matchId: string): Promise<boolean> {
    const { data, error } = await this.db.rpc("start_match", { p_match_id: matchId });
    if (error) throw error;
    return data ?? false;
  }

  async finish(matchId: string, winnerTeam: TeamSide): Promise<boolean> {
    const { data, error } = await this.db.rpc("finish_match", {
      p_match_id:    matchId,
      p_winner_team: winnerTeam,
    });
    if (error) throw error;
    return data ?? false;
  }

  async assignForecastToFreeCourts(sessionId: string): Promise<void> {
    const { error } = await this.db.rpc("assign_forecast_to_free_courts", {
      p_session_id: sessionId,
    });
    if (error) throw error;
  }

  async getForecastPool(sessionId: string) {
    const { data, error } = await this.db
      .from("forecast_pool_view")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async getMatchHistory(sessionId: string) {
    const { data, error } = await this.db
      .from("match_history_view")
      .select("*")
      .eq("session_id", sessionId)
      .order("ended_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }
}
