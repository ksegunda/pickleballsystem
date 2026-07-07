import type { TypedSupabaseClient } from "@/lib/supabase/types";
import { CourtRepository } from "@/repositories/court.repository";
import { QueueRepository } from "@/repositories/queue.repository";
import { SessionRepository } from "@/repositories/session.repository";
import { MatchRepository } from "@/repositories/match.repository";
import { PLAYERS_PER_MATCH } from "@/lib/constants/status";
import type { MatchEligibility, ForecastSet, ForecastRow } from "@/types/match.types";
import type { TeamSide } from "@/types/database.types";

export class MatchmakingService {
  private courtRepo:   CourtRepository;
  private queueRepo:   QueueRepository;
  private sessionRepo: SessionRepository;
  private matchRepo:   MatchRepository;

  constructor(private readonly db: TypedSupabaseClient) {
    this.courtRepo   = new CourtRepository(db);
    this.queueRepo   = new QueueRepository(db);
    this.sessionRepo = new SessionRepository(db);
    this.matchRepo   = new MatchRepository(db);
  }

  private async getPlayersPerMatch(sessionId: string): Promise<number> {
    const settings = await this.sessionRepo.getSettings(sessionId);
    return settings.match_format === "singles" ? 2 : PLAYERS_PER_MATCH;
  }

  async getCourtsBoard(sessionId: string) {
    // Claim any free court with the oldest ready forecast set, then top the pool
    // back up — same "recompute on read" idiom as recalculate_priority_scores,
    // so this self-heals on every page load and every realtime-triggered refresh.
    await this.matchRepo.assignForecastToFreeCourts(sessionId);

    const [courts, queue, playersPerMatch, forecastRows] = await Promise.all([
      this.courtRepo.getCourtsWithStatus(sessionId),
      this.queueRepo.getQueueWithStats(sessionId),
      this.getPlayersPerMatch(sessionId),
      this.matchRepo.getForecastPool(sessionId),
    ]);

    const waitingCount = queue.length;

    const eligibility: MatchEligibility = {
      playersPerMatch,
      waitingCount,
      hasEnoughPlayers: waitingCount >= playersPerMatch,
    };

    const forecastPool = this.buildForecastPool(courts.length, forecastRows, waitingCount, playersPerMatch);

    return { courts, eligibility, forecastPool, queue };
  }

  /**
   * One slot per configured court. Filled slots are real, committed sets (stable
   * once formed); trailing empty slots are placeholders showing how many more
   * waiting players are needed, computed the same way a per-court preview used to.
   */
  private buildForecastPool(
    totalSlots: number,
    forecastRows: ForecastRow[],
    waitingCount: number,
    playersPerMatch: number
  ): ForecastSet[] {
    const pool: ForecastSet[] = forecastRows.map((row, i) => ({
      matchId:   row.match_id,
      setNumber: i + 1,
      players:   (row.players as unknown as ForecastSet["players"]) ?? [],
      missing:   0,
    }));

    let remaining = waitingCount;
    for (let i = pool.length; i < totalSlots; i++) {
      pool.push({
        matchId:   null,
        setNumber: i + 1,
        players:   [],
        missing:   Math.max(0, playersPerMatch - remaining),
      });
      remaining = Math.max(0, remaining - playersPerMatch);
    }

    return pool;
  }

  async generateMatch(sessionId: string, courtId?: string): Promise<string | null> {
    return this.matchRepo.generate(sessionId, courtId);
  }

  async startMatch(matchId: string): Promise<boolean> {
    return this.matchRepo.start(matchId);
  }

  async finishMatch(matchId: string, winnerTeam: TeamSide): Promise<boolean> {
    return this.matchRepo.finish(matchId, winnerTeam);
  }
}
