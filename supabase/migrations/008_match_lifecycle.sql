-- =============================================================
-- Migration 008: Match Lifecycle — Start & Finish
-- Two atomic functions covering the rest of the match flow.
-- Court/player status, stats, and partner/opponent history all
-- cascade automatically via the triggers already defined in
-- migration 004 once matches.status changes — these functions
-- only need to drive that column (plus the pieces the triggers
-- don't cover: match_players.result and the post-match requeue).
-- =============================================================

-- =============================================================
-- FUNCTION: start_match
-- pending -> in_progress. Returns whether it actually happened
-- (false if the match was missing, not owned, or not pending).
-- =============================================================
CREATE OR REPLACE FUNCTION start_match(p_match_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE matches
  SET status = 'in_progress', started_at = now()
  WHERE id = p_match_id AND status = 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- FUNCTION: finish_match
-- Declares a winner, completes the match, and sends all 4
-- players back to the queue as "waiting" (not "resting" — this
-- session wants an immediate requeue, not a cooldown state).
--
-- Order matters: match_players.result must be set BEFORE the
-- matches UPDATE, because fn_update_stats_after_match reads that
-- column when it fires off the status change to 'completed'.
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
    RETURN false; -- not found, not owned (RLS), or not in_progress
  END IF;

  UPDATE match_players
  SET result = CASE WHEN team = p_winner_team THEN 'win' ELSE 'loss' END::match_result
  WHERE match_id = p_match_id;

  SELECT array_agg(player_id) INTO v_player_ids
  FROM match_players
  WHERE match_id = p_match_id;

  -- Cascades: player_statistics (wins/losses/streaks), partner_history,
  -- opponent_history, court -> available, players -> resting.
  UPDATE matches
  SET status = 'completed', winner_team = p_winner_team, ended_at = now()
  WHERE id = p_match_id;

  -- Override the trigger's "resting" default — send them straight back
  -- to the queue instead of a cooldown state.
  UPDATE players
  SET status = 'waiting', last_active = now()
  WHERE id = ANY(v_player_ids);

  INSERT INTO queue_entries (session_id, player_id, status, entered_queue)
  SELECT v_session_id, pid, 'waiting', now()
  FROM unnest(v_player_ids) AS pid;

  PERFORM recalculate_priority_scores(v_session_id);
  PERFORM recalculate_queue_positions(v_session_id);

  RETURN true;
END;
$$ LANGUAGE plpgsql;
