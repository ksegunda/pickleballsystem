// =============================================================
// DEV/TESTING-ONLY: bulk-seed fake players into a session's queue.
//
// CLI-only by design — this file lives outside app/ and pages/, so
// Next.js never bundles or serves it; it cannot be reached by any
// HTTP request against a deployed build. Run locally with:
//
//   npm run seed:test-players -- --session <sessionId> --count 20
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (server-only,
// git-ignored, never deployed) to bypass RLS the same way a manual
// migration would — there's no player-facing insert path for this
// by design (every real player write goes through a SECURITY
// DEFINER RPC), so a batch dev tool reasonably uses the same
// elevated access class as an admin task.
// =============================================================

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { config } from "dotenv";
import type { Database } from "../types/database.types";

config({ path: ".env.local" });

// Belt-and-suspenders: refuses to run even if somehow invoked outside
// a real dev shell (e.g. accidentally wired into a hosted context later).
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run: NODE_ENV=production.");
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx === -1 ? undefined : args[idx + 1];
  };

  const sessionId = get("--session");
  const count = Number(get("--count") ?? "10");

  if (!sessionId) {
    console.error("Usage: npm run seed:test-players -- --session <sessionId> [--count 10]");
    process.exit(1);
  }
  if (!Number.isInteger(count) || count < 1 || count > 200) {
    console.error("--count must be an integer between 1 and 200.");
    process.exit(1);
  }

  return { sessionId, count };
}

const FIRST_NAMES = [
  "David", "Miguel", "Bianca", "Josh", "Angel", "Rafael", "Nicole", "Carlo",
  "Mika", "Andrei", "Kiana", "Marco", "Sophia", "Luis", "Camille", "Nathan",
  "Pia", "Jerome", "Trisha", "Kevin", "Jasmine", "Patrick", "Leah", "Aaron",
  "Diane", "Ryan", "Abby", "Christian", "Erika", "Lance", "Vince", "Hannah",
  "Mark", "Bea", "JC", "Andrea", "Kyle", "Janine", "Felix", "Rica",
];

function pickUniqueNames(count: number): string[] {
  const shuffled = [...FIRST_NAMES].sort(() => Math.random() - 0.5);
  const names: string[] = [];
  const baseCycle = [...shuffled];

  let round = 0;
  while (names.length < count) {
    const name = baseCycle[names.length % baseCycle.length];
    names.push(round === 0 ? name : `${name} ${round + 1}`);
    if ((names.length % baseCycle.length) === 0) round++;
  }

  return names;
}

async function main() {
  const { sessionId, count } = parseArgs();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
    process.exit(1);
  }

  const supabase = createClient<Database>(url, serviceKey);

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, session_name, status")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    console.error(`Session ${sessionId} not found:`, sessionError?.message);
    process.exit(1);
  }

  console.log(`Seeding ${count} fake players into "${session.session_name}" (${session.status})...`);

  const names = pickUniqueNames(count);
  const players = Array.from({ length: count }, (_, i) => ({
    session_id:   sessionId,
    display_name: names[i],
    device_token: `test-${randomUUID()}`,
  }));

  const { data: insertedPlayers, error: playersError } = await supabase
    .from("players")
    .insert(players)
    .select("id");

  if (playersError || !insertedPlayers) {
    console.error("Failed to insert players:", playersError?.message);
    process.exit(1);
  }

  const queueEntries = insertedPlayers.map((p) => ({
    session_id: sessionId,
    player_id:  p.id,
    status:     "waiting" as const,
  }));

  const { error: queueError } = await supabase.from("queue_entries").insert(queueEntries);
  if (queueError) {
    console.error("Failed to insert queue entries:", queueError.message);
    process.exit(1);
  }

  // Recompute priority scores/positions so the seeded queue is
  // realistically ordered instead of just insertion order — the same
  // step forecast_next_sets runs before it reads the queue.
  await supabase.rpc("recalculate_priority_scores", { p_session_id: sessionId });
  await supabase.rpc("recalculate_queue_positions", { p_session_id: sessionId });

  console.log(`Done. Inserted ${insertedPlayers.length} players with random display names.`);
  console.log(`All have a "test-" device_token prefix — use it to identify or bulk-delete them later.`);
}

main();
