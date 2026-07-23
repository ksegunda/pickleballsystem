"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MatchmakingService } from "@/services/matchmaking.service";
import { ROUTES } from "@/lib/constants/routes";
import { PLAYERS_PER_MATCH } from "@/lib/constants/status";
import type { ActionResult } from "./auth.actions";
import type { TeamSide, LockType } from "@/types/database.types";

export async function getCourtsBoardAction(sessionId: string) {
  try {
    const supabase = await createClient();
    const service  = new MatchmakingService(supabase);
    return await service.getCourtsBoard(sessionId);
  } catch {
    return {
      courts: [],
      eligibility: { playersPerMatch: PLAYERS_PER_MATCH, waitingCount: 0, hasEnoughPlayers: false },
      forecastPool: [],
      queue: [],
      lockedPlayers: [],
    };
  }
}

export async function getMatchHistoryAction(sessionId: string) {
  try {
    const supabase = await createClient();
    const service  = new MatchmakingService(supabase);
    return await service.getMatchHistory(sessionId);
  } catch {
    return [];
  }
}

// Public/player-facing — same public_read_* RLS as the other player.actions
// reads, no host auth required.
export async function getAllCourtsAction(sessionId: string) {
  try {
    const supabase = await createClient();
    const service  = new MatchmakingService(supabase);
    return await service.getAllCourts(sessionId);
  } catch {
    return [];
  }
}

export async function movePlayerAction(
  sessionId:   string,
  playerId:    string,
  destMatchId: string | null,
  destTeam:    TeamSide | null
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const service = new MatchmakingService(supabase);
    const ok = await service.movePlayer(playerId, destMatchId, destTeam);

    if (!ok) {
      return { success: false, error: "Could not move this player — that spot may already be full, or things changed since you loaded this page." };
    }

    revalidatePath(ROUTES.COURTS(sessionId));
    return { success: true, data: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to move this player.";
    return { success: false, error: msg };
  }
}

export async function shuffleQueueAction(
  sessionId: string
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const service = new MatchmakingService(supabase);
    await service.shuffleQueue(sessionId);

    revalidatePath(ROUTES.COURTS(sessionId));
    return { success: true, data: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to shuffle the queue.";
    return { success: false, error: msg };
  }
}

export async function incrementForecastTargetAction(
  sessionId: string
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const service = new MatchmakingService(supabase);
    await service.incrementForecastTarget(sessionId);

    revalidatePath(ROUTES.COURTS(sessionId));
    return { success: true, data: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to add another set.";
    return { success: false, error: msg };
  }
}

export async function createManualMatchAction(
  sessionId: string,
  teamA:     string[],
  teamB:     string[]
): Promise<ActionResult<{ matchId: string }>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const service = new MatchmakingService(supabase);
    const matchId = await service.createManualMatch(sessionId, teamA, teamB);

    if (!matchId) {
      return {
        success: false,
        error: "Could not create this match — one of the selected players may no longer be waiting.",
      };
    }

    revalidatePath(ROUTES.COURTS(sessionId));
    return { success: true, data: { matchId } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create the match.";
    return { success: false, error: msg };
  }
}

export async function createLockedSetAction(
  sessionId: string,
  lockType:  LockType,
  players:   string[],
  teams?:    TeamSide[]
): Promise<ActionResult<{ lockedSetId: string }>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const service = new MatchmakingService(supabase);
    const lockedSetId = await service.createLockedSet(sessionId, lockType, players, teams);

    if (!lockedSetId) {
      return {
        success: false,
        error: "Could not create this lock — one of the selected players may already be locked.",
      };
    }

    revalidatePath(ROUTES.COURTS(sessionId));
    return { success: true, data: { lockedSetId } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to lock these players.";
    return { success: false, error: msg };
  }
}

export async function deleteLockedSetAction(
  sessionId:    string,
  lockedSetId:  string
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const service = new MatchmakingService(supabase);
    const ok = await service.deleteLockedSet(lockedSetId);

    if (!ok) {
      return { success: false, error: "This lock is already gone." };
    }

    revalidatePath(ROUTES.COURTS(sessionId));
    return { success: true, data: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to unlock these players.";
    return { success: false, error: msg };
  }
}

export async function generateMatchAction(
  sessionId: string,
  courtId?: string
): Promise<ActionResult<{ matchId: string }>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const service = new MatchmakingService(supabase);
    const matchId = await service.generateMatch(sessionId, courtId);

    if (!matchId) {
      return {
        success: false,
        error: "Not enough waiting players for this court yet, or it's no longer available.",
      };
    }

    revalidatePath(ROUTES.COURTS(sessionId));
    revalidatePath(ROUTES.DASHBOARD(sessionId));
    return { success: true, data: { matchId } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to generate match.";
    return { success: false, error: msg };
  }
}

export async function startMatchAction(
  sessionId: string,
  matchId: string
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const service = new MatchmakingService(supabase);
    const started = await service.startMatch(matchId);

    if (!started) {
      return { success: false, error: "This match can no longer be started." };
    }

    revalidatePath(ROUTES.COURTS(sessionId));
    revalidatePath(ROUTES.DASHBOARD(sessionId));
    return { success: true, data: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to start match.";
    return { success: false, error: msg };
  }
}

export async function finishMatchAction(
  sessionId: string,
  matchId: string,
  winnerTeam: TeamSide
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const service = new MatchmakingService(supabase);
    const finished = await service.finishMatch(matchId, winnerTeam);

    if (!finished) {
      return { success: false, error: "This match is no longer in progress." };
    }

    revalidatePath(ROUTES.COURTS(sessionId));
    revalidatePath(ROUTES.DASHBOARD(sessionId));
    revalidatePath(ROUTES.STATS(sessionId));
    revalidatePath(ROUTES.LEADERBOARD(sessionId));
    return { success: true, data: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to finish match.";
    return { success: false, error: msg };
  }
}
