import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database.types";
import type { SessionInsert, SessionUpdate } from "@/types/session.types";

type DB = TypedSupabaseClient;

export class SessionRepository {
  constructor(private readonly db: DB) {}

  async findById(id: string) {
    const { data, error } = await this.db
      .from("sessions")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  }

  async findByJoinCode(code: string) {
    const { data, error } = await this.db
      .from("sessions")
      .select("*")
      .eq("join_code", code.toUpperCase())
      .in("status", ["pending", "active"])
      .single();
    if (error) throw error;
    return data;
  }

  async findByHostId(hostId: string) {
    const { data, error } = await this.db
      .from("sessions")
      .select("*")
      .eq("host_id", hostId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async findSummaryById(id: string) {
    const { data, error } = await this.db
      .from("session_summary_view")
      .select("*")
      .eq("session_id", id)
      .single();
    if (error) throw error;
    return data;
  }

  async create(payload: SessionInsert) {
    const { data, error } = await this.db
      .from("sessions")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async update(id: string, payload: SessionUpdate) {
    const { data, error } = await this.db
      .from("sessions")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async createSettings(sessionId: string, settings: Partial<Database["public"]["Tables"]["session_settings"]["Insert"]>) {
    const { data, error } = await this.db
      .from("session_settings")
      .insert({ session_id: sessionId, ...settings })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async getSettings(sessionId: string) {
    const { data, error } = await this.db
      .from("session_settings")
      .select("*")
      .eq("session_id", sessionId)
      .single();
    if (error) throw error;
    return data;
  }

  async createCourts(sessionId: string, count: number) {
    const { error } = await this.db
      .rpc("create_session_courts", {
        p_session_id: sessionId,
        p_num_courts: count,
      });
    if (error) throw error;
  }
}
