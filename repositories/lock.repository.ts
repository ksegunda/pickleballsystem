import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { LockType, TeamSide } from "@/types/database.types";

type DB = TypedSupabaseClient;

export class LockRepository {
  constructor(private readonly db: DB) {}

  async getLockedPlayers(sessionId: string) {
    const { data, error } = await this.db
      .from("locked_players_view")
      .select("*")
      .eq("session_id", sessionId);
    if (error) throw error;
    return data ?? [];
  }

  async create(sessionId: string, lockType: LockType, players: string[], teams?: TeamSide[]): Promise<string | null> {
    const { data, error } = await this.db.rpc("create_locked_set", {
      p_session_id: sessionId,
      p_lock_type:  lockType,
      p_players:    players,
      ...(teams ? { p_teams: teams } : {}),
    });
    if (error) throw error;
    return data ?? null;
  }

  async delete(lockedSetId: string): Promise<boolean> {
    const { data, error } = await this.db.rpc("delete_locked_set", {
      p_locked_set_id: lockedSetId,
    });
    if (error) throw error;
    return data ?? false;
  }
}
