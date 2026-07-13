import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { JoinSessionInput } from "@/types/player.types";
import type { CurrentMatchView, MatchPlayerView, MatchHistoryEntry } from "@/types/match.types";
import type { MatchResult } from "@/types/database.types";
import { PlayerRepository } from "@/repositories/player.repository";
import { QueueRepository } from "@/repositories/queue.repository";
import { SessionRepository } from "@/repositories/session.repository";
import { CourtRepository } from "@/repositories/court.repository";
import { MatchRepository } from "@/repositories/match.repository";

interface CourtMatchPlayerRow {
  player_id:    string;
  display_name: string;
  team:         "team_a" | "team_b";
}

export class PlayerService {
  private playerRepo: PlayerRepository;
  private queueRepo:  QueueRepository;
  private sessionRepo: SessionRepository;
  private courtRepo:  CourtRepository;
  private matchRepo:  MatchRepository;

  constructor(private readonly db: TypedSupabaseClient) {
    this.playerRepo  = new PlayerRepository(db);
    this.queueRepo   = new QueueRepository(db);
    this.sessionRepo = new SessionRepository(db);
    this.courtRepo   = new CourtRepository(db);
    this.matchRepo   = new MatchRepository(db);
  }

  async joinSession(input: JoinSessionInput) {
    // Validate session exists and is active/pending
    const session = await this.sessionRepo.findById(input.session_id);
    if (!["active", "pending"].includes(session.status)) {
      throw new Error("This session is not accepting new players.");
    }

    // Check max player limit
    if (session.max_players) {
      const existing = await this.playerRepo.findBySession(input.session_id);
      if (existing.length >= session.max_players) {
        throw new Error("This session has reached its maximum player limit.");
      }
    }

    // Check if player already joined (by device token)
    const existing = await this.playerRepo.findByDeviceToken(
      input.session_id,
      input.device_token
    );
    if (existing) {
      // Re-add to queue if not already in it
      const inQueue = await this.playerRepo.getQueueEntry(existing.id, input.session_id);
      if (!inQueue) {
        await this.queueRepo.addToQueue(input.session_id, existing.id);
      }
      return { player: existing, isReturning: true };
    }

    // Create new player. Two distinct unique constraints can reject this
    // insert: unique_name_per_session (a real conflict — tell the caller)
    // and idx_players_device_token_unique (this exact device lost a race
    // against its own concurrent join attempt — e.g. two open tabs — in
    // which case the winning attempt already created the player; reuse it
    // instead of erroring).
    let player;
    try {
      player = await this.playerRepo.create({
        session_id:   input.session_id,
        display_name: input.display_name,
        device_token: input.device_token,
        status:       "waiting",
      });
    } catch (err) {
      const code = (err as { code?: unknown } | null)?.code;
      if (code === "23505") {
        const message = (err as { message?: string }).message ?? "";
        if (message.includes("idx_players_device_token_unique")) {
          const winner = await this.playerRepo.findByDeviceToken(input.session_id, input.device_token);
          if (winner) {
            const inQueue = await this.playerRepo.getQueueEntry(winner.id, input.session_id);
            if (!inQueue) {
              await this.queueRepo.addToQueue(input.session_id, winner.id);
            }
            return { player: winner, isReturning: true };
          }
        }
        throw new Error("That name is already taken in this session — try a different one.");
      }
      throw err;
    }

    // Auto-add to queue
    await this.queueRepo.addToQueue(input.session_id, player.id);

    // Recalculate queue positions
    await this.queueRepo.recalculatePositions(input.session_id);

    return { player, isReturning: false };
  }

  async leaveSession(playerId: string, deviceToken?: string) {
    return this.playerRepo.leave(playerId, deviceToken);
  }

  async setResting(playerId: string, resting: boolean, deviceToken?: string) {
    return this.playerRepo.setResting(playerId, resting, deviceToken);
  }

  async getPlayerWithContext(playerId: string, sessionId: string) {
    const [player, stats, queueEntry] = await Promise.all([
      this.playerRepo.findById(playerId),
      this.playerRepo.getStatistics(playerId, sessionId),
      this.playerRepo.getQueueEntry(playerId, sessionId),
    ]);

    if (!player) return null;

    return {
      ...player,
      statistics:    stats,
      queue_entry:   queueEntry,
      queue_position: queueEntry?.position ?? null,
    };
  }

  async getCurrentMatch(sessionId: string, playerId: string): Promise<CurrentMatchView | null> {
    const court = await this.courtRepo.findActiveCourtForPlayer(sessionId, playerId);
    if (court && court.match_id && court.match_status) {
      const players = (court.players as unknown as CourtMatchPlayerRow[]) ?? [];
      const parts = await this.buildMatchParts(sessionId, playerId, players);
      if (!parts) return null;

      return {
        court_id:     court.court_id,
        court_name:   court.court_name,
        court_number: court.court_number,
        match_id:     court.match_id,
        match_status: court.match_status,
        started_at:   court.started_at,
        ...parts,
      };
    }

    // Not on a court yet — check whether they've been reserved into an
    // upcoming forecast set (teammates already decided, no court assigned).
    const forecastRows = await this.matchRepo.getForecastPool(sessionId);
    const forecastRow = forecastRows.find((row) => {
      const players = (row.players as unknown as CourtMatchPlayerRow[]) ?? [];
      return players.some((p) => p.player_id === playerId);
    });
    if (!forecastRow) return null;

    const players = (forecastRow.players as unknown as CourtMatchPlayerRow[]) ?? [];
    const parts = await this.buildMatchParts(sessionId, playerId, players);
    if (!parts) return null;

    return {
      court_id:     null,
      court_name:   null,
      court_number: null,
      match_id:     forecastRow.match_id,
      match_status: "forecasted",
      started_at:   null,
      ...parts,
    };
  }

  private async buildMatchParts(
    sessionId: string,
    playerId: string,
    players: CourtMatchPlayerRow[]
  ): Promise<{ me: MatchPlayerView; partner: MatchPlayerView | null; opponents: MatchPlayerView[] } | null> {
    const me = players.find((p) => p.player_id === playerId);
    if (!me) return null;

    const stats = await this.playerRepo.getStatisticsForPlayers(
      sessionId,
      players.map((p) => p.player_id)
    );
    const statsById = new Map(stats.map((s) => [s.player_id, s]));

    const toView = (p: CourtMatchPlayerRow): MatchPlayerView => {
      const s = statsById.get(p.player_id);
      const gamesPlayed = s?.games_played ?? 0;
      const wins = s?.wins ?? 0;
      return {
        player_id:    p.player_id,
        display_name: p.display_name,
        games_played: gamesPlayed,
        wins,
        win_rate:     gamesPlayed === 0 ? 0 : Math.round((wins / gamesPlayed) * 100),
      };
    };

    const partner   = players.find((p) => p.team === me.team && p.player_id !== playerId);
    const opponents = players.filter((p) => p.team !== me.team);

    return {
      me:        toView(me),
      partner:   partner ? toView(partner) : null,
      opponents: opponents.map(toView),
    };
  }

  async getSessionPlayers(sessionId: string) {
    return this.playerRepo.findBySession(sessionId);
  }

  async getTotalPlayersServed(sessionIds: string[]) {
    return this.playerRepo.countAcrossSessions(sessionIds);
  }

  async getLeaderboard(sessionId: string) {
    return this.playerRepo.getLeaderboard(sessionId);
  }

  async getMatchHistory(sessionId: string, playerId: string): Promise<MatchHistoryEntry[]> {
    const rows = await this.matchRepo.getMatchHistory(sessionId);

    const entries: MatchHistoryEntry[] = [];
    for (const row of rows) {
      const players = (row.players as unknown as Array<CourtMatchPlayerRow & { result: MatchResult | null }>) ?? [];
      const me = players.find((p) => p.player_id === playerId);
      if (!me) continue;

      const partner   = players.find((p) => p.team === me.team && p.player_id !== playerId);
      const opponents = players.filter((p) => p.team !== me.team);

      entries.push({
        matchId:     row.match_id,
        matchNumber: row.match_number,
        courtName:   row.court_name,
        startedAt:   row.started_at,
        endedAt:     row.ended_at,
        result:      me.result,
        partner:     partner?.display_name ?? null,
        opponents:   opponents.map((p) => p.display_name),
      });
    }
    return entries;
  }
}
