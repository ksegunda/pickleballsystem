import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

// Derive the exact client type from @supabase/ssr's factory so it's
// always consistent regardless of the underlying generic signature.
export type TypedSupabaseClient = ReturnType<typeof createBrowserClient<Database>>;
