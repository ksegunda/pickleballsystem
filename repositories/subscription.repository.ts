import type { TypedSupabaseClient } from "@/lib/supabase/types";

type DB = TypedSupabaseClient;

const FREE_TIER_MONTHLY_SESSION_LIMIT = 3;

export class SubscriptionRepository {
  constructor(private readonly db: DB) {}

  async getByHostId(hostId: string) {
    const { data, error } = await this.db
      .from("subscriptions")
      .select("*")
      .eq("host_id", hostId)
      .maybeSingle();
    if (error) throw error;
    // Trigger-provisioned on host creation (migration 021) — a missing row
    // here means an edge case the trigger didn't cover, not a real absence
    // of a plan. Treat it the same as an explicit free plan rather than
    // erroring the whole session-creation flow over a bookkeeping gap.
    return data ?? { plan_type: "free" as const, status: "active" as const };
  }

  async countSessionsThisMonth(hostId: string): Promise<number> {
    const { data, error } = await this.db.rpc("count_sessions_this_month", { p_host_id: hostId });
    if (error) throw error;
    return data ?? 0;
  }

  // Unlimited only while an active paid plan is in force — an
  // expired/cancelled paid plan falls back to the free cap rather than
  // silently staying unlimited forever.
  async isUnderFreeLimitOrUnlimited(hostId: string): Promise<{ allowed: boolean; limit: number | null; used: number }> {
    const sub = await this.getByHostId(hostId);
    const isUnlimited = sub.plan_type !== "free" && sub.status === "active";
    if (isUnlimited) {
      return { allowed: true, limit: null, used: 0 };
    }
    const used = await this.countSessionsThisMonth(hostId);
    return { allowed: used < FREE_TIER_MONTHLY_SESSION_LIMIT, limit: FREE_TIER_MONTHLY_SESSION_LIMIT, used };
  }
}
