"use server";

import { revalidatePath } from "next/cache";
import { createClient }  from "@/lib/supabase/server";
import { joinSessionSchema } from "@/lib/validations/player.schema";
import { PlayerService } from "@/services/player.service";
import { SessionService } from "@/services/session.service";
import { ROUTES } from "@/lib/constants/routes";
import type { JoinSessionSchema } from "@/lib/validations/player.schema";
import type { ActionResult } from "./auth.actions";
import type { Player } from "@/types/player.types";

// Host-side add for players without a phone — unlike the self-service join
// actions below, this needs real host authorization: the `players` INSERT
// RLS policy is deliberately permissive (any active/pending session, no
// ownership check — that's what makes anonymous self-join work at all), so
// it alone can't be trusted to stop one host from adding players into a
// DIFFERENT host's session. Ownership is checked explicitly here instead.
export async function addPlayerManuallyAction(
  sessionId:   string,
  displayName: string
): Promise<ActionResult<{ player: Player }>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const sessionService = new SessionService(supabase);
    const session = await sessionService.getSession(sessionId);
    if (session.host_id !== user.id) {
      return { success: false, error: "Unauthorized" };
    }

    const service = new PlayerService(supabase);
    const player  = await service.addPlayerManually(sessionId, displayName.trim());

    revalidatePath(ROUTES.PLAYERS(sessionId));
    return { success: true, data: { player } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to add player.";
    return { success: false, error: msg };
  }
}

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

export async function leaveSessionAction(
  playerId:    string,
  deviceToken: string
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const service  = new PlayerService(supabase);
    const ok = await service.leaveSession(playerId, deviceToken);
    if (!ok) return { success: false, error: "Could not leave the session. Please try again." };
    return { success: true, data: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not leave the session.";
    return { success: false, error: msg };
  }
}

export async function setRestingAction(
  playerId:    string,
  resting:     boolean,
  deviceToken: string
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const service  = new PlayerService(supabase);
    const ok = await service.setResting(playerId, resting, deviceToken);
    if (!ok) {
      return {
        success: false,
        error: resting ? "Could not update your status." : "Could not rejoin the queue.",
      };
    }
    return { success: true, data: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not update your status.";
    return { success: false, error: msg };
  }
}

// Host-initiated — no device token, authorized instead via the calling
// host's own session (checked inside fn_authorize_player_action).
export async function removePlayerAction(
  playerId: string
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const service  = new PlayerService(supabase);
    const ok = await service.leaveSession(playerId);
    if (!ok) return { success: false, error: "Could not remove this player." };
    return { success: true, data: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not remove this player.";
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
