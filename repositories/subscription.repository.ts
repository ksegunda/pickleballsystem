import type { TypedSupabaseClient } from "@/lib/supabase/types";

type DB = TypedSupabaseClient;

export type SubscriptionBlockReason = "cancelled" | "free_limit" | null;

export interface SubscriptionLimitCheck {
  allowed: boolean;
  limit:   number | null;
  used:    number;
  reason:  SubscriptionBlockReason;
}

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
    return data ?? { plan_type: "free" as const, status: "active" as const, expires_at: null, session_limit: 1 };
  }

  async countSessionsThisMonth(hostId: string): Promise<number> {
    const { data, error } = await this.db.rpc("count_sessions_this_month", { p_host_id: hostId });
    if (error) throw error;
    return data ?? 0;
  }

  // "Cancelled" is a universal, plan-independent hard stop — checked first,
  // before any plan-type branching — so a cancelled Free host can't still
  // slip in under the free-tier cap. Expired (Monthly only; Free/Lifetime
  // can never even reach this status — see migration 029) is deliberately
  // NOT a hard stop: it falls back to the free-tier cap instead, same as
  // it always has, rather than a full block.
  //
  // The cap itself (session_limit) is per-host, set by the super admin —
  // not a single hardcoded number for every free host (migration 030).
  async isUnderFreeLimitOrUnlimited(hostId: string): Promise<SubscriptionLimitCheck> {
    const sub = await this.getByHostId(hostId);

    if (sub.status === "cancelled") {
      return { allowed: false, limit: 0, used: 0, reason: "cancelled" };
    }

    const isUnlimited = sub.plan_type !== "free" && sub.status === "active";
    if (isUnlimited) {
      return { allowed: true, limit: null, used: 0, reason: null };
    }

    const used = await this.countSessionsThisMonth(hostId);
    const allowed = used < sub.session_limit;
    return { allowed, limit: sub.session_limit, used, reason: allowed ? null : "free_limit" };
  }
}
