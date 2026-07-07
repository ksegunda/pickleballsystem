"use server";

import { createClient }  from "@/lib/supabase/server";
import { joinSessionSchema } from "@/lib/validations/player.schema";
import { PlayerService } from "@/services/player.service";
import type { JoinSessionSchema } from "@/lib/validations/player.schema";
import type { ActionResult } from "./auth.actions";
import type { Player } from "@/types/player.types";

export async function joinSessionAction(
  formData: JoinSessionSchema
): Promise<ActionResult<{ player: Player; isReturning: boolean }>> {
  const parsed = joinSessionSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message };
  }

  try {
    const supabase = await createClient();
    const service  = new PlayerService(supabase);
    const result   = await service.joinSession({
      session_id:   parsed.data.join_code, // will be resolved to session ID by caller
      display_name: parsed.data.display_name,
      device_token: parsed.data.device_token,
    });
    return { success: true, data: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to join session.";
    return { success: false, error: msg };
  }
}

export async function joinSessionByIdAction(
  sessionId:   string,
  displayName: string,
  deviceToken: string
): Promise<ActionResult<{ player: Player; isReturning: boolean }>> {
  if (!displayName.trim() || displayName.trim().length < 2) {
    return { success: false, error: "Name must be at least 2 characters." };
  }
  if (displayName.trim().length > 30) {
    return { success: false, error: "Name must be under 30 characters." };
  }

  try {
    const supabase = await createClient();
    const service  = new PlayerService(supabase);
    const result   = await service.joinSession({
      session_id:   sessionId,
      display_name: displayName.trim(),
      device_token: deviceToken,
    });
    return { success: true, data: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to join session.";
    return { success: false, error: msg };
  }
}

export async function getPlayerContextAction(
  playerId:  string,
  sessionId: string
) {
  try {
    const supabase = await createClient();
    const service  = new PlayerService(supabase);
    return await service.getPlayerWithContext(playerId, sessionId);
  } catch {
    return null;
  }
}

export async function getCurrentMatchAction(playerId: string, sessionId: string) {
  try {
    const supabase = await createClient();
    const service  = new PlayerService(supabase);
    return await service.getCurrentMatch(sessionId, playerId);
  } catch {
    return null;
  }
}

export async function getSessionPlayersAction(sessionId: string) {
  try {
    const supabase = await createClient();
    const service  = new PlayerService(supabase);
    return await service.getSessionPlayers(sessionId);
  } catch {
    return [];
  }
}

export async function getLeaderboardAction(sessionId: string) {
  try {
    const supabase = await createClient();
    const service  = new PlayerService(supabase);
    return await service.getLeaderboard(sessionId);
  } catch {
    return [];
  }
}

export async function getMatchHistoryAction(sessionId: string, playerId: string) {
  try {
    const supabase = await createClient();
    const service  = new PlayerService(supabase);
    return await service.getMatchHistory(sessionId, playerId);
  } catch {
    return [];
  }
}
