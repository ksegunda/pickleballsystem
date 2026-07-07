import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database.types";

type DB = TypedSupabaseClient;

export class QueueRepository {
  constructor(private readonly db: DB) {}

  async getQueueWithStats(sessionId: string) {
    const { data, error } = await this.db
      .from("queue_with_stats")
      .select("*")
      .eq("session_id", sessionId)
      .eq("queue_status", "waiting")
      .order("priority_score", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async addToQueue(sessionId: string, playerId: string) {
    const { data, error } = await this.db
      .from("queue_entries")
      .insert({
        session_id:     sessionId,
        player_id:      playerId,
        entered_queue:  new Date().toISOString(),
        status:         "waiting",
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async removeFromQueue(entryId: string) {
    const { error } = await this.db
      .from("queue_entries")
      .update({ status: "removed" })
      .eq("id", entryId);
    if (error) throw error;
  }

  async markAsMatched(playerIds: string[], sessionId: string) {
    const { error } = await this.db
      .from("queue_entries")
      .update({ status: "matched" })
      .eq("session_id", sessionId)
      .in("player_id", playerIds)
      .eq("status", "waiting");
    if (error) throw error;
  }

  async recalculatePositions(sessionId: string) {
    const { error } = await this.db
      .rpc("recalculate_queue_positions", { p_session_id: sessionId });
    if (error) throw error;
  }

  async getQueuePosition(playerId: string, sessionId: string): Promise<number | null> {
    const { data, error } = await this.db
      .from("queue_entries")
      .select("position")
      .eq("player_id", playerId)
      .eq("session_id", sessionId)
      .eq("status", "waiting")
      .maybeSingle();
    if (error) throw error;
    return data?.position ?? null;
  }
}
