import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { CreateSessionInput } from "@/types/session.types";
import { SessionRepository } from "@/repositories/session.repository";
import { generateJoinCode } from "@/lib/utils/generate-code";

export class SessionService {
  private repo: SessionRepository;

  constructor(private readonly db: TypedSupabaseClient) {
    this.repo = new SessionRepository(db);
  }

  async createSession(hostId: string, input: CreateSessionInput) {
    const join_code = generateJoinCode();

    // Create the session
    const session = await this.repo.create({
      host_id:          hostId,
      club_name:        input.club_name,
      session_name:     input.session_name,
      session_date:     input.session_date,
      start_time:       input.start_time,
      end_time:         input.end_time || null,
      number_of_courts: input.number_of_courts,
      max_players:      input.max_players ?? null,
      status:           "pending",
      join_code,
    });

    // Create default settings. If this fails (e.g. a constraint the client-side
    // validation didn't catch), roll back the session row above instead of
    // leaving an orphaned session with no settings.
    try {
      await this.repo.createSettings(session.id, {
        theme:                  input.settings?.theme ?? "light",
        dark_mode:              input.settings?.dark_mode ?? false,
        language:               input.settings?.language ?? "en",
        allow_late_join:        input.settings?.allow_late_join ?? true,
        games_to_win:           input.settings?.games_to_win ?? 11,
        match_format:           input.settings?.match_format ?? "doubles",
        weight_waiting_time:    input.settings?.weight_waiting_time ?? 0.40,
        weight_games_played:    input.settings?.weight_games_played ?? 0.35,
        weight_performance:     input.settings?.weight_performance ?? 0.25,
        anti_repeat_threshold:  input.settings?.anti_repeat_threshold ?? 3,
      });
    } catch (err) {
      await this.repo.delete(session.id).catch(() => {});
      throw err;
    }

    return session;
  }

  async startSession(sessionId: string) {
    const session = await this.repo.findById(sessionId);
    if (session.status !== "pending") {
      throw new Error("Session is not in pending state");
    }

    // Create court records
    await this.repo.createCourts(sessionId, session.number_of_courts);

    // Start the session
    return this.repo.update(sessionId, {
      status:     "active",
      started_at: new Date().toISOString(),
    });
  }

  async getSessionByJoinCode(code: string) {
    return this.repo.findByJoinCode(code);
  }

  async getHostSessions(hostId: string) {
    return this.repo.findByHostId(hostId);
  }

  async getSessionSummary(sessionId: string) {
    return this.repo.findSummaryById(sessionId);
  }

  async getSession(sessionId: string) {
    return this.repo.findById(sessionId);
  }
}
