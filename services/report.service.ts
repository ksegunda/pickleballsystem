import type { TypedSupabaseClient } from "@/lib/supabase/types";
import { SessionRepository } from "@/repositories/session.repository";
import { PlayerRepository } from "@/repositories/player.repository";
import { MatchRepository } from "@/repositories/match.repository";
import { generateSessionReportPdf } from "@/lib/utils/pdf/session-report";
import type { SessionReportData } from "@/types/session.types";

export class ReportService {
  private sessionRepo: SessionRepository;
  private playerRepo:  PlayerRepository;
  private matchRepo:   MatchRepository;

  constructor(private readonly db: TypedSupabaseClient) {
    this.sessionRepo = new SessionRepository(db);
    this.playerRepo  = new PlayerRepository(db);
    this.matchRepo   = new MatchRepository(db);
  }

  /**
   * End an active session: compiles the final report while player data
   * still exists, generates the PDF, and persists the JSONB snapshot to
   * `reports` — all BEFORE the atomic delete-and-close RPC runs. If PDF
   * generation or the report insert throws, nothing has been deleted and
   * the session is still 'active'; the caller can simply retry.
   */
  async endSessionWithReport(sessionId: string): Promise<{
    pdfBytes:   Uint8Array;
    reportData: SessionReportData;
  }> {
    const session = await this.sessionRepo.findById(sessionId);
    if (session.status !== "active") {
      throw new Error("Only an active session can be ended.");
    }

    const [summary, leaderboard, matchHistory] = await Promise.all([
      this.sessionRepo.findSummaryById(sessionId).catch(() => null),
      this.playerRepo.getLeaderboard(sessionId),
      this.matchRepo.getMatchHistory(sessionId),
    ]);

    const courtCounts = new Map<string, number>();
    for (const row of matchHistory) {
      courtCounts.set(row.court_name, (courtCounts.get(row.court_name) ?? 0) + 1);
    }

    const startedAt = session.started_at ? new Date(session.started_at) : null;
    const generatedAt = new Date();

    const reportData: SessionReportData = {
      clubName:             session.club_name,
      sessionName:          session.session_name,
      sessionDate:          session.session_date,
      startTime:            session.start_time,
      endTime:              session.end_time,
      generatedAt:          generatedAt.toISOString(),
      totalPlayers:         leaderboard.length,
      totalMatches:         matchHistory.length,
      avgMatchDurationSecs: summary?.avg_match_duration_secs ?? null,
      sessionDurationSecs:  startedAt
        ? Math.floor((generatedAt.getTime() - startedAt.getTime()) / 1000)
        : null,
      courts: Array.from(courtCounts.entries()).map(([courtName, matchesPlayed]) => ({
        courtName,
        matchesPlayed,
      })),
      leaderboard: leaderboard.map((p) => ({
        rank:        p.rank,
        displayName: p.display_name,
        wins:        p.wins,
        losses:      p.losses,
        gamesPlayed: p.games_played,
        winRate:     p.win_rate,
      })),
    };

    const pdfBytes = generateSessionReportPdf(reportData);

    // Durable snapshot BEFORE anything destructive happens.
    await this.sessionRepo.createReport(sessionId, reportData);

    // Only now: atomic delete of all player-related data + status -> 'ended'.
    const ended = await this.sessionRepo.endSession(sessionId);
    if (!ended) {
      throw new Error("Session could not be ended — it may have already ended.");
    }

    return { pdfBytes, reportData };
  }
}
