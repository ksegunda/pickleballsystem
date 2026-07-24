import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { Database, Json } from "@/types/database.types";
import type { SessionInsert, SessionUpdate, SessionReportData } from "@/types/session.types";

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

  // Public/player-facing — session_branding_view exposes only club_name
  // + host_avatar_url (not the rest of the `hosts` row, which has no
  // public RLS policy), so this is safe to call unauthenticated.
  async findBranding(sessionId: string) {
    const { data, error } = await this.db
      .from("session_branding_view")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();
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

  async delete(id: string) {
    const { error } = await this.db.from("sessions").delete().eq("id", id);
    if (error) throw error;
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

  async incrementForecastTarget(sessionId: string): Promise<void> {
    const { error } = await this.db.rpc("increment_forecast_target", { p_session_id: sessionId });
    if (error) throw error;
  }

  async createCourts(sessionId: string, count: number) {
    const { error } = await this.db
      .rpc("create_session_courts", {
        p_session_id: sessionId,
        p_num_courts: count,
      });
    if (error) throw error;
  }

  // Snapshot of the final report, persisted before player data is purged —
  // this is what "All Sessions" history can still show after the session ends.
  async createReport(sessionId: string, data: SessionReportData) {
    const { error } = await this.db
      .from("reports")
      .insert({ session_id: sessionId, data: data as unknown as Json });
    if (error) throw error;
  }

  // Flips the session to 'ended' — no longer deletes anything (see
  // migration 025; migration 014's purge behavior was reversed). Returns
  // false if the session wasn't found or wasn't 'active'.
  async endSession(sessionId: string): Promise<boolean> {
    const { data, error } = await this.db.rpc("end_session", { p_session_id: sessionId });
    if (error) throw error;
    return data ?? false;
  }
}
