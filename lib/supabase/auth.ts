import { cache } from "react";
import { createClient } from "./server";

// Memoized per-request: multiple calls within the same Server Component
// render (layout + nested layout + action) reuse one Supabase Auth round-trip
// instead of re-verifying the JWT on every call site.
export const getVerifiedUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});
