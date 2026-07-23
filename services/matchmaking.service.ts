import type { TypedSupabaseClient } from "@/lib/supabase/types";
import { CourtRepository } from "@/repositories/court.repository";
import { QueueRepository } from "@/repositories/queue.repository";
import { SessionRepository } from "@/repositories/session.repository";
import { MatchRepository } from "@/repositories/match.repository";
import { LockRepository } from "@/repositories/lock.repository";
import { PLAYERS_PER_MATCH } from "@/lib/constants/status";
import type { MatchEligibility, ForecastSet, ForecastRow } from "@/types/match.types";
import type { TeamSide, LockType } from "@/types/database.types";

export class MatchmakingService {
  private courtRepo:   CourtRepository;
  private queueRepo:   QueueRepository;
  private sessionRepo: SessionRepository;
  private matchRepo:   MatchRepository;
  private lockRepo:    LockRepository;

  constructor(private readonly db: TypedSupabaseClient) {
    this.courtRepo   = new CourtRepository(db);
    this.queueRepo   = new QueueRepository(db);
    this.sessionRepo = new SessionRepository(db);
    this.matchRepo   = new MatchRepository(db);
    this.lockRepo    = new LockRepository(db);
  }

  async getCourtsBoard(sessionId: string) {
    // Claim any free court with the oldest ready forecast set, then top the pool
    // back up — same "recompute on read" idiom as recalculate_priority_scores,
    // so this self-heals on every page load and every realtime-triggered refresh.
    await this.matchRepo.assignForecastToFreeCourts(sessionId);

    const [courts, queue, settings, forecastRows, lockedPlayers] = await Promise.all([
      this.courtRepo.getCourtsWithStatus(sessionId),
      this.queueRepo.getQueueWithStats(sessionId),
      this.sessionRepo.getSettings(sessionId),
      this.matchRepo.getForecastPool(sessionId),
      this.lockRepo.getLockedPlayers(sessionId),
    ]);

    const playersPerMatch = settings.match_format === "singles" ? 2 : PLAYERS_PER_MATCH;
    const waitingCount = queue.length;

    const eligibility: MatchEligibility = {
      playersPerMatch,
      waitingCount,
      hasEnoughPlayers: waitingCount >= playersPerMatch,
    };

    // forecast_pool_view is already ordered by created_at ASC — auto and
    // manual rows are interleaved here in real creation order, not split
    // apart, so a manual match takes whichever position its age earns it
    // instead of always being pinned to the end (see Bug 5). The auto-slot
    // count is now the host-controlled target_forecast_count (default 1,
    // grown one at a time via the "+" next to "Next Up") instead of one
    // per court.
    const forecastPool = this.buildForecastPool(settings.target_forecast_count, forecastRows, waitingCount, playersPerMatch);

    return { courts, eligibility, forecastPool, queue, lockedPlayers };
  }

  async incrementForecastTarget(sessionId: string): Promise<void> {
    return this.sessionRepo.incrementForecastTarget(sessionId);
  }

  async getMatchHistory(sessionId: string) {
    return this.matchRepo.getMatchHistory(sessionId);
  }

  // Read-only, no eligibility/forecast/queue payload — used by the
  // player-side "All Courts" view, which only needs live court assignments.
  async getAllCourts(sessionId: string) {
    return this.courtRepo.getCourtsWithStatus(sessionId);
  }

  // Same read the host's Courts board already shows — public_read_queue
  // RLS scopes it to this session regardless of caller, so this is safe to
  // expose to any player, not just the host.
  async getPublicQueue(sessionId: string) {
    return this.queueRepo.getQueueWithStats(sessionId);
  }

  // Deliberately narrower than getCourtsBoard: a plain read of whatever
  // forecasted sets already exist, no assignForecastToFreeCourts call and
  // no empty-slot placeholders — those are host-only concerns (a write
  // side effect, and "waiting for N more players" isn't useful to a
  // random player browsing the Courts tab). Same setNumber convention as
  // buildForecastPool (sequential among auto sets only) so "Set 2" here
  // means the same thing it does on the host board.
  async getPublicForecastPool(sessionId: string): Promise<ForecastSet[]> {
    const rows = await this.matchRepo.getForecastPool(sessionId);
    let autoIndex = 0;
    return rows.map((row) => {
      if (!row.is_manual) autoIndex += 1;
      return {
        matchId:   row.match_id,
        setNumber: row.is_manual ? 0 : autoIndex,
        isManual:  row.is_manual,
        players:   (row.players as unknown as ForecastSet["players"]) ?? [],
        missing:   0,
      };
    });
  }

  async createLockedSet(sessionId: string, lockType: LockType, players: string[], teams?: TeamSide[]): Promise<string | null> {
    return this.lockRepo.create(sessionId, lockType, players, teams);
  }

  async shuffleQueue(sessionId: string): Promise<void> {
    return this.queueRepo.shuffle(sessionId);
  }

  async deleteLockedSet(lockedSetId: string): Promise<boolean> {
    return this.lockRepo.delete(lockedSetId);
  }

  async updateMatchTeams(matchId: string, teamA: string[], teamB: string[]): Promise<boolean> {
    return this.matchRepo.updateTeams(matchId, teamA, teamB);
  }

  async removeForecastSet(matchId: string): Promise<boolean> {
    return this.matchRepo.removeForecastSet(matchId);
  }

  async createManualMatch(sessionId: string, teamA: string[], teamB: string[]): Promise<string | null> {
    return this.matchRepo.createManual(sessionId, teamA, teamB);
  }

  /**
   * Real (filled) slots first, in creation-time order — auto and manual
   * mixed together, whichever was formed earliest renders first, so a
   * manual match reshuffles alongside auto sets instead of always sitting
   * last. Manual doesn't count against the target capacity below (it's
   * an additional slot, not one of the target_forecast_count auto ones) —
   * only auto rows factor into how many trailing empty placeholders are needed.
   * Auto cards get sequential "Set N" labels based on their position among
   * just the numbered slots; a manual card's label ("Manual") comes from
   * its isManual flag on the frontend, never from setNumber.
   */
  private buildForecastPool(
    totalCourtSlots: number,
    forecastRows: ForecastRow[],
    waitingCount: number,
    playersPerMatch: number
  ): ForecastSet[] {
    const filled: ForecastSet[] = forecastRows.map((row) => ({
      matchId:   row.match_id,
      setNumber: 0,
      isManual:  row.is_manual,
      players:   (row.players as unknown as ForecastSet["players"]) ?? [],
      missing:   0,
    }));

    const autoFilledCount = forecastRows.filter((row) => !row.is_manual).length;
    let remaining = waitingCount;
    const emptySlots: ForecastSet[] = [];
    for (let i = autoFilledCount; i < totalCourtSlots; i++) {
      emptySlots.push({
        matchId:   null,
        setNumber: 0,
        isManual:  false,
        players:   [],
        missing:   Math.max(0, playersPerMatch - remaining),
      });
      remaining = Math.max(0, remaining - playersPerMatch);
    }

    const pool = [...filled, ...emptySlots];
    let autoIndex = 0;
    for (const set of pool) {
      if (!set.isManual) {
        autoIndex += 1;
        set.setNumber = autoIndex;
      }
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
