"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MatchmakingService } from "@/services/matchmaking.service";
import { ROUTES } from "@/lib/constants/routes";
import { PLAYERS_PER_MATCH } from "@/lib/constants/status";
import type { ActionResult } from "./auth.actions";
import type { TeamSide } from "@/types/database.types";

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
    };
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
