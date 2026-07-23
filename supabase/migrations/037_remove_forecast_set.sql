-- =============================================================
-- Migration 037: Remove a Next Up set
-- Backs the host's new "-" button on a Next Up set card — the inverse
-- of increment_forecast_target (migration 033's "+" button), but
-- targeted at one specific set rather than just shrinking a count,
-- since the host picks which card to remove in the UI.
--
-- Only ever removes a still-forecasted (not yet promoted to a court)
-- auto set. Manual matches have their own lifecycle and aren't
-- touched by this. Guards target_forecast_count staying >= 1 so
-- there's always at least one auto set — the frontend separately
-- only ever renders this button on setNumber > 1 (never "Set 1"),
-- but setNumber is a read-time position, not a stored fact, so this
-- guard is the real enforcement, not just the UI hiding the button.
-- =============================================================
CREATE OR REPLACE FUNCTION remove_forecast_set(p_match_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_session_id UUID;
  v_target     INTEGER;
BEGIN
  SELECT m.session_id INTO v_session_id
  FROM matches m
  WHERE m.id = p_match_id AND m.status = 'forecasted' AND m.is_manual = false
  FOR UPDATE;

  IF v_session_id IS NULL THEN
    RETURN false; -- not found/not owned, already promoted/started, or manual
  END IF;

  SELECT target_forecast_count INTO v_target
  FROM session_settings WHERE session_id = v_session_id
  FOR UPDATE;

  IF v_target <= 1 THEN
    RETURN false; -- always keep at least one auto set
  END IF;

  -- Return this set's players to the queue — same "just flip the status
  -- back" shape as fn_vacate_matched_seat's dissolve branch (016), minus
  -- the backfill search since the host is deliberately shrinking the
  -- pool, not trying to keep this set alive. entered_queue is untouched,
  -- so nobody loses their fairness-wait credit for having been matched.
  UPDATE queue_entries SET status = 'waiting'
  WHERE session_id = v_session_id AND status = 'matched'
    AND player_id IN (SELECT player_id FROM match_players WHERE match_id = p_match_id);

  DELETE FROM matches WHERE id = p_match_id;

  UPDATE session_settings SET target_forecast_count = target_forecast_count - 1
  WHERE session_id = v_session_id;

  PERFORM recalculate_priority_scores(v_session_id);
  PERFORM recalculate_queue_positions(v_session_id);

  RETURN true;
END;
$$ LANGUAGE plpgsql;
