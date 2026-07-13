-- =============================================================
-- Migration 016: Player Leave & Rest
-- Two player-lifecycle actions, callable either by the player
-- themselves (device_token) or by the host acting on their behalf
-- (auth.uid() ownership) — the first SECURITY DEFINER functions in
-- this schema, since players carry no RLS grant to mutate their own
-- players/queue_entries rows (players_update_own relies on a
-- Postgres session var the app never actually sets).
-- =============================================================

-- =============================================================
-- One-time cleanup: retire orphaned 'matched' queue_entries rows
-- that already exist for players who also currently hold a
-- 'waiting' row. Root cause fixed in finish_match below; this
-- clears out what already accumulated (see supabase/fix_singles_
-- and_requeue.sql — this exact symptom already had to be patched
-- by hand once). Narrowly targeted: a player legitimately can't be
-- both freshly-waiting and still-matched-into-an-old-set at once,
-- so this signature is unambiguous.
-- =============================================================
UPDATE queue_entries qe
SET status = 'removed'
WHERE status = 'matched'
  AND EXISTS (
    SELECT 1 FROM queue_entries qe2
    WHERE qe2.player_id = qe.player_id AND qe2.status = 'waiting'
  );

-- =============================================================
-- FUNCTION: fn_authorize_player_action (internal)
-- Shared ownership check reused by every player-lifecycle function
-- below. Returns the player's session_id if authorized, else NULL.
-- Authorized if EITHER the caller supplies the player's real
-- device_token, OR the caller is the Supabase-authenticated host
-- who owns the session — that second path is what lets a host call
-- these functions on a player's behalf (e.g. "Remove Player").
--
-- NULL-safe by hand (not IS DISTINCT FROM): players.device_token
-- has no NOT NULL constraint, so a naive comparison would let a
-- NULL-vs-NULL collision bypass auth entirely the moment any player
-- ever gets inserted without a token.
--
-- Not SECURITY DEFINER itself and REVOKEd from direct client access
-- below — only ever called from within the SECURITY DEFINER
-- functions in this file, whose already-elevated execution context
-- it inherits automatically (standard Postgres nested-call rules).
-- =============================================================
CREATE OR REPLACE FUNCTION fn_authorize_player_action(
  p_player_id     UUID,
  p_device_token  TEXT
)
RETURNS UUID AS $$
DECLARE
  v_session_id    UUID;
  v_actual_token  TEXT;
BEGIN
  SELECT session_id, device_token INTO v_session_id, v_actual_token
  FROM players
  WHERE id = p_player_id AND is_active = true
  FOR UPDATE;

  IF v_session_id IS NULL THEN
    RETURN NULL; -- not found, or already left
  END IF;

  IF (p_device_token IS NULL OR v_actual_token IS NULL OR p_device_token <> v_actual_token)
     AND NOT EXISTS (SELECT 1 FROM sessions WHERE id = v_session_id AND host_id = auth.uid())
  THEN
    RETURN NULL; -- neither the owning device nor the owning host
  END IF;

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION fn_authorize_player_action(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- =============================================================
-- FUNCTION: fn_vacate_matched_seat (internal)
-- If the player is currently seated in match_players for a
-- not-yet-started set (status IN ('forecasted','pending')),
-- backfills their seat with the next fair player from the queue
-- (same priority_score DESC, entered_queue ASC ordering
-- generate_match/forecast_next_sets already use), or dissolves the
-- whole set if no one is left to backfill with rather than leave it
-- short-handed. No-ops if the player isn't seated anywhere.
--
-- FOR UPDATE OF m on the initial lookup guards against racing a
-- concurrent start_match promoting this exact match to in_progress
-- mid-vacate. Same REVOKE treatment as the function above — internal
-- only, inherits its caller's elevated context.
-- =============================================================
CREATE OR REPLACE FUNCTION fn_vacate_matched_seat(p_player_id UUID)
RETURNS VOID AS $$
DECLARE
  v_match_id    UUID;
  v_team        team_side;
  v_session_id  UUID;
  v_candidate   UUID;
BEGIN
  SELECT mp.match_id, mp.team, m.session_id
  INTO v_match_id, v_team, v_session_id
  FROM match_players mp
  JOIN matches m ON m.id = mp.match_id
  WHERE mp.player_id = p_player_id AND m.status IN ('forecasted', 'pending')
  FOR UPDATE OF m;

  IF v_match_id IS NULL THEN
    RETURN; -- not seated in an unstarted set, nothing to do
  END IF;

  SELECT player_id INTO v_candidate
  FROM queue_entries
  WHERE session_id = v_session_id AND status = 'waiting'
  ORDER BY priority_score DESC, entered_queue ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_candidate IS NULL THEN
    -- No one left to backfill with — dissolve rather than leave the
    -- set short-handed. Cascades match_players; the other seated
    -- players go back to 'waiting' instead of being stranded at
    -- 'matched' with no match left to point to.
    UPDATE queue_entries SET status = 'waiting'
    WHERE session_id = v_session_id
      AND status = 'matched'
      AND player_id IN (
        SELECT player_id FROM match_players
        WHERE match_id = v_match_id AND player_id <> p_player_id
      );
    DELETE FROM matches WHERE id = v_match_id;
  ELSE
    DELETE FROM match_players WHERE match_id = v_match_id AND player_id = p_player_id;
    INSERT INTO match_players (match_id, player_id, team) VALUES (v_match_id, v_candidate, v_team);
    UPDATE queue_entries SET status = 'matched'
    WHERE session_id = v_session_id AND player_id = v_candidate AND status = 'waiting';
  END IF;
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION fn_vacate_matched_seat(UUID) FROM PUBLIC, anon, authenticated;

-- =============================================================
-- FUNCTION: leave_session
-- Permanent soft-remove. Never deletes the players row (would
-- cascade-delete player_statistics/partner_history/opponent_history,
-- corrupting completed-match history for everyone who played against
-- them) — is_active = false instead, the same flag leaderboard_view
-- and PlayerRepository.findBySession already filter on.
-- =============================================================
CREATE OR REPLACE FUNCTION leave_session(
  p_player_id     UUID,
  p_device_token  TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_session_id  UUID;
  v_status      player_status;
BEGIN
  v_session_id := fn_authorize_player_action(p_player_id, p_device_token);
  IF v_session_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT status INTO v_status FROM players WHERE id = p_player_id;
  IF v_status = 'playing' THEN
    RETURN false; -- no clean way to pull someone out of a live match
  END IF;

  PERFORM fn_vacate_matched_seat(p_player_id);

  UPDATE queue_entries SET status = 'removed'
  WHERE player_id = p_player_id AND status IN ('waiting', 'matched');

  UPDATE players
  SET is_active = false, status = 'offline', last_active = now()
  WHERE id = p_player_id;

  PERFORM recalculate_priority_scores(v_session_id);
  PERFORM recalculate_queue_positions(v_session_id);

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- FUNCTION: set_resting
-- Temporary, toggleable exclusion from matchmaking. Turning rest
-- off resets entered_queue to now() — time spent resting shouldn't
-- silently accrue as wait-time fairness credit — while leaving
-- player_statistics (games/wins) untouched.
-- =============================================================
CREATE OR REPLACE FUNCTION set_resting(
  p_player_id     UUID,
  p_resting       BOOLEAN,
  p_device_token  TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_session_id  UUID;
  v_status      player_status;
BEGIN
  v_session_id := fn_authorize_player_action(p_player_id, p_device_token);
  IF v_session_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT status INTO v_status FROM players WHERE id = p_player_id;
  IF v_status = 'playing' THEN
    RETURN false;
  END IF;

  IF p_resting THEN
    PERFORM fn_vacate_matched_seat(p_player_id);

    UPDATE queue_entries SET status = 'resting'
    WHERE player_id = p_player_id AND status IN ('waiting', 'matched');

    UPDATE players SET status = 'resting', last_active = now() WHERE id = p_player_id;
  ELSE
    UPDATE queue_entries SET status = 'waiting', entered_queue = now()
    WHERE player_id = p_player_id AND status = 'resting';

    -- Safety net: insert a fresh waiting row if one doesn't already
    -- exist (e.g. their queue row went missing some other way) —
    -- keeps this idempotent rather than silently leaving them with
    -- no queue presence at all.
    INSERT INTO queue_entries (session_id, player_id, status, entered_queue)
    SELECT v_session_id, p_player_id, 'waiting', now()
    WHERE NOT EXISTS (
      SELECT 1 FROM queue_entries WHERE player_id = p_player_id AND status = 'waiting'
    );

    UPDATE players SET status = 'waiting', last_active = now() WHERE id = p_player_id;
  END IF;

  PERFORM recalculate_priority_scores(v_session_id);
  PERFORM recalculate_queue_positions(v_session_id);

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- FUNCTION: finish_match (redefined)
-- Same as migration 008, with one fix: retire the 'matched' queue
-- row each player already holds from being selected into the match
-- that just finished, before inserting their fresh 'waiting' row.
-- The old version left that row behind as a permanent orphan —
-- already bit this project once (see supabase/fix_singles_and_
-- requeue.sql) — which then breaks any code that assumes a player
-- has at most one non-terminal queue_entries row, including
-- leave_session/set_resting above.
-- =============================================================
CREATE OR REPLACE FUNCTION finish_match(
  p_match_id    UUID,
  p_winner_team team_side
)
RETURNS BOOLEAN AS $$
DECLARE
  v_session_id UUID;
  v_player_ids UUID[];
BEGIN
  SELECT session_id INTO v_session_id
  FROM matches
  WHERE id = p_match_id AND status = 'in_progress';

  IF v_session_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE match_players
  SET result = CASE WHEN team = p_winner_team THEN 'win' ELSE 'loss' END::match_result
  WHERE match_id = p_match_id;

  SELECT array_agg(player_id) INTO v_player_ids
  FROM match_players
  WHERE match_id = p_match_id;

  UPDATE matches
  SET status = 'completed', winner_team = p_winner_team, ended_at = now()
  WHERE id = p_match_id;

  UPDATE players
  SET status = 'waiting', last_active = now()
  WHERE id = ANY(v_player_ids);

  -- Retire the row these players were selected out of before
  -- inserting their new one, so they never carry more than one
  -- live queue_entries row at a time.
  UPDATE queue_entries SET status = 'removed'
  WHERE session_id = v_session_id AND player_id = ANY(v_player_ids) AND status = 'matched';

  INSERT INTO queue_entries (session_id, player_id, status, entered_queue)
  SELECT v_session_id, pid, 'waiting', now()
  FROM unnest(v_player_ids) AS pid;

  PERFORM recalculate_priority_scores(v_session_id);
  PERFORM recalculate_queue_positions(v_session_id);

  RETURN true;
END;
$$ LANGUAGE plpgsql;
