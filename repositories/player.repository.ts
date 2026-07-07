import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database.types";
import type { PlayerInsert } from "@/types/player.types";

type DB = TypedSupabaseClient;

export class PlayerRepository {
  constructor(private readonly db: DB) {}

  async findById(id: string) {
    const { data, error } = await this.db
      .from("players")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findByDeviceToken(sessionId: string, deviceToken: string) {
    const { data, error } = await this.db
      .from("players")
      .select("*")
      .eq("session_id", sessionId)
      .eq("device_token", deviceToken)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findBySession(sessionId: string) {
    const { data, error } = await this.db
      .from("players")
      .select("*")
      .eq("session_id", sessionId)
      .eq("is_active", true)
      .order("joined_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async create(payload: PlayerInsert) {
    const { data, error } = await this.db
      .from("players")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateStatus(id: string, status: Database["public"]["Enums"]["player_status"]) {
    const { data, error } = await this.db
      .from("players")
      .update({ status, last_active: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async getStatistics(playerId: string, sessionId: string) {
    const { data, error } = await this.db
      .from("player_statistics")
      .select("*")
      .eq("player_id", playerId)
      .eq("session_id", sessionId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async getStatisticsForPlayers(sessionId: string, playerIds: string[]) {
    if (playerIds.length === 0) return [];
    const { data, error } = await this.db
      .from("player_statistics")
      .select("*")
      .eq("session_id", sessionId)
      .in("player_id", playerIds);
    if (error) throw error;
    return data ?? [];
  }

  async getQueueEntry(playerId: string, sessionId: string) {
    const { data, error } = await this.db
      .from("queue_entries")
      .select("*")
      .eq("player_id", playerId)
      .eq("session_id", sessionId)
      .eq("status", "waiting")
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async getLeaderboard(sessionId: string) {
    const { data, error } = await this.db
      .from("leaderboard_view")
      .select("*")
      .eq("session_id", sessionId)
      .order("rank", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }
}
