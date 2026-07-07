"use client";

import { createClient } from "./client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export type RealtimeEntity = "queue" | "courts" | "stats" | "players" | "matches";

export function sessionChannel(sessionId: string, entity: RealtimeEntity): string {
  return `session:${sessionId}:${entity}`;
}

// Subscribe to Postgres changes for a specific table + session
export function subscribeToTable<T extends Record<string, unknown>>(
  sessionId: string,
  entity:    RealtimeEntity,
  table:     string,
  onEvent:   (payload: RealtimePostgresChangesPayload<T>) => void
): RealtimeChannel {
  const supabase = createClient();

  const channel = supabase.channel(sessionChannel(sessionId, entity));

  channel
    .on<T>(
      "postgres_changes",
      {
        event:  "*",
        schema: "public",
        table,
        filter: `session_id=eq.${sessionId}`,
      },
      onEvent
    )
    .subscribe();

  return channel;
}

export async function unsubscribe(channel: RealtimeChannel): Promise<void> {
  const supabase = createClient();
  await supabase.removeChannel(channel);
}
