import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// Privileged, service-role client — bypasses RLS entirely. Never import
// this from a Client Component or anywhere reachable by the browser; the
// `server-only` import above makes any such attempt a build error.
//
// Used specifically for the host-logo upload: storage.objects has no RLS
// policies granting host writes (adding one means another hand-pasted SQL
// migration, same friction as every DDL change in this project), so the
// upload goes through this client server-side instead, after the calling
// Server Action has already independently verified the request is really
// that host via the normal authenticated client.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
