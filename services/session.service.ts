import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { CreateSessionInput } from "@/types/session.types";
import { SessionRepository } from "@/repositories/session.repository";
import { SubscriptionRepository } from "@/repositories/subscription.repository";
import { generateJoinCode } from "@/lib/utils/generate-code";

export class SessionService {
  private repo: SessionRepository;
  private subscriptionRepo: SubscriptionRepository;

  constructor(private readonly db: TypedSupabaseClient) {
    this.repo = new SessionRepository(db);
    this.subscriptionRepo = new SubscriptionRepository(db);
  }

  async createSession(hostId: string, input: CreateSessionInput) {
    const { allowed, limit, used, reason } = await this.subscriptionRepo.isUnderFreeLimitOrUnlimited(hostId);
    if (!allowed) {
      if (reason === "cancelled") {
        throw new Error(
          "Your subscription has been cancelled. Please contact support to resubscribe and continue creating sessions."
        );
      }
      throw new Error(
        `You've reached your Free plan's limit of ${limit} session${limit === 1 ? "" : "s"} this month (${used}/${limit} used). Upgrade to Monthly or Lifetime for unlimited sessions.`
      );
    }

    const join_code = generateJoinCode();

    // club_name lives on the host profile now, not the creation form — a
    // point-in-time copy onto the session row (not a live reference), so a
    // later profile edit doesn't retroactively rename past sessions' stored
    // club name.
    const { data: host, error: hostError } = await this.db
      .from("hosts")
      .select("club_name")
      .eq("id", hostId)
      .single();
    if (hostError || !host?.club_name) {
      throw new Error("Your host profile is missing a club name. Please set one in your profile before creating a session.");
    }

    // Create the session
    const session = await this.repo.create({
      host_id:          hostId,
      club_name:        host.club_name,
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
        language:               input.settings?.language ?? "en",
        allow_late_join:        input.settings?.allow_late_join ?? true,
        games_to_win:           input.settings?.games_to_win ?? 11,
        match_format:           input.settings?.match_format ?? "doubles",
        player_level:           input.settings?.player_level ?? "all_levels",
        // No longer host-configurable — the fairness algorithm keeps
        // running exactly as before, just always on these defaults now
        // instead of taking weights from the creation form.
        weight_waiting_time:    0.40,
        weight_games_played:    0.35,
        weight_performance:     0.25,
        anti_repeat_threshold:  input.settings?.anti_repeat_threshold ?? 1,
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

  async getSessionBranding(sessionId: string) {
    return this.repo.findBranding(sessionId);
  }

  async getSession(sessionId: string) {
    return this.repo.findById(sessionId);
  }

  // The only path that actually removes a session's data — a plain
  // `DELETE FROM sessions` cascades to every child table already (see
  // migration 001's ON DELETE CASCADE FKs), so nothing extra is needed
  // here beyond guarding that it's only ever called on a session that's
  // actually done (never active/pending — those go through End Session
  // first, which no longer deletes anything on its own).
  async deleteSession(sessionId: string): Promise<void> {
    const session = await this.repo.findById(sessionId);
    if (!["ended", "archived"].includes(session.status)) {
      throw new Error("Only an ended session can be deleted. End it first.");
    }
    await this.repo.delete(sessionId);
  }

  async getSettings(sessionId: string) {
    return this.repo.getSettings(sessionId);
  }

  async getSubscription(hostId: string) {
    return this.subscriptionRepo.getByHostId(hostId);
  }

  // Everything the /sessions page needs in one call — plan/status, usage,
  // and whether "New Session" should be disabled (and why), so the page
  // doesn't need a second round-trip just to render its own banner.
  async getSubscriptionUsage(hostId: string) {
    const [subscription, limitCheck] = await Promise.all([
      this.subscriptionRepo.getByHostId(hostId),
      this.subscriptionRepo.isUnderFreeLimitOrUnlimited(hostId),
    ]);
    return {
      ...subscription,
      used:    limitCheck.used,
      limit:   limitCheck.limit,
      allowed: limitCheck.allowed,
      reason:  limitCheck.reason,
    };
  }
}
