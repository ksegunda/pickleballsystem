"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVerifiedUser } from "@/lib/supabase/auth";
import type { ActionResult } from "./auth.actions";
import type { SubscriptionPlan, SubscriptionStatus } from "@/types/database.types";

// Re-verified independently in every action below — never trust a client
// claim of admin-ness, only the platform_admins self-check row.
async function requirePlatformAdmin(): Promise<string | null> {
  const user = await getVerifiedUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_admins")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  return data ? user.id : null;
}

// For layout-level gating (mirrors getHostAction()'s role for the host
// area) — resolves to the admin's user id, or null if the current
// visitor isn't one.
export async function getPlatformAdminAction(): Promise<string | null> {
  return requirePlatformAdmin();
}

export interface AdminHostRow {
  id:               string;
  name:             string;
  email:            string;
  club_name:        string | null;
  is_suspended:     boolean;
  created_at:       string;
  plan_type:        SubscriptionPlan;
  status:           SubscriptionStatus;
  expires_at:       string | null;
}

export async function getAllHostsAction(): Promise<ActionResult<AdminHostRow[]>> {
  const adminId = await requirePlatformAdmin();
  if (!adminId) return { success: false, error: "Unauthorized" };

  // Cross-host read — no RLS policy permits this for a normal host (each
  // only ever sees their own row), so it goes through the service-role
  // client. Safe here because requirePlatformAdmin() already independently
  // confirmed the caller's real identity above.
  const admin = createAdminClient();
  const [{ data: hosts, error: hostsError }, { data: subs, error: subsError }] = await Promise.all([
    admin.from("hosts").select("id, name, email, club_name, is_suspended, created_at").order("created_at", { ascending: false }),
    admin.from("subscriptions").select("host_id, plan_type, status, expires_at"),
  ]);

  if (hostsError || subsError) {
    return { success: false, error: "Could not load hosts." };
  }

  const subsByHost = new Map((subs ?? []).map((s) => [s.host_id, s]));
  const rows: AdminHostRow[] = (hosts ?? []).map((h) => {
    const sub = subsByHost.get(h.id);
    return {
      ...h,
      plan_type:  sub?.plan_type ?? "free",
      status:     sub?.status ?? "active",
      expires_at: sub?.expires_at ?? null,
    };
  });

  return { success: true, data: rows };
}

export async function updateHostSubscriptionAction(
  hostId: string,
  planType: SubscriptionPlan,
  status: SubscriptionStatus,
  expiresAt: string | null
): Promise<ActionResult<null>> {
  const adminId = await requirePlatformAdmin();
  if (!adminId) return { success: false, error: "Unauthorized" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("subscriptions")
    .update({
      plan_type:  planType,
      status,
      expires_at: planType === "lifetime" ? null : expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("host_id", hostId);

  if (error) {
    return { success: false, error: "Could not update this host's subscription." };
  }

  revalidatePath("/admin");
  return { success: true, data: null };
}

export async function toggleHostSuspensionAction(
  hostId: string,
  suspended: boolean
): Promise<ActionResult<null>> {
  const adminId = await requirePlatformAdmin();
  if (!adminId) return { success: false, error: "Unauthorized" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("hosts")
    .update({ is_suspended: suspended })
    .eq("id", hostId);

  if (error) {
    return { success: false, error: "Could not update this host's account status." };
  }

  revalidatePath("/admin");
  return { success: true, data: null };
}
