-- =============================================================
-- Migration 022: Unlimited concurrent manual matches
-- Removes create_manual_match's "only one active manual match at a
-- time" guard. The host can now add as many manual matches as the
-- queue can actually support — the pre-existing "are these players
-- still really waiting" recheck (v_locked_count <> v_expected) is
-- what naturally stops you from creating more than the queue has
-- players for; it needed no change.
--
-- forecast_next_sets's two is_manual = false pool-count exclusions
-- (migration 017) already treat manual matches as an uncounted
-- category rather than a max-one one, so they're untouched here.
-- =============================================================

CREATE OR REPLACE FUNCTION create_manual_match(
  p_session_id  UUID,
  p_team_a      UUID[],
  p_team_b      UUID[]
)
RETURNS UUID AS $$
DECLARE
  v_match_id      UUID;
  v_match_number  SMALLINT;
  v_all           UUID[];
  v_expected      INTEGER;
  v_locked_count  INTEGER;
BEGIN
  v_all      := p_team_a || p_team_b;
  v_expected := COALESCE(array_length(p_team_a, 1), 0) + COALESCE(array_length(p_team_b, 1), 0);

  IF NOT fn_validate_team_split(p_team_a, p_team_b, v_expected) THEN
    RETURN NULL;
  END IF;

  -- Lock these exact players' waiting queue rows so a concurrent
  -- generate_match/forecast_next_sets/create_manual_match call can't
  -- grab one of them first. Split into two statements because
  -- Postgres disallows combining FOR UPDATE with an aggregate
  -- function in the same query.
  PERFORM 1 FROM queue_entries
  WHERE session_id = p_session_id AND player_id = ANY(v_all) AND status = 'waiting'
  FOR UPDATE;

  SELECT COUNT(*) INTO v_locked_count
  FROM queue_entries
  WHERE session_id = p_session_id AND player_id = ANY(v_all) AND status = 'waiting';

  IF v_locked_count <> v_expected THEN
    RETURN NULL; -- someone selected in the UI is no longer actually waiting
  END IF;

  v_match_number := get_next_match_number(p_session_id);

  INSERT INTO matches (session_id, court_id, match_number, status, is_manual)
  VALUES (p_session_id, NULL, v_match_number, 'forecasted', true)
  RETURNING id INTO v_match_id;

  INSERT INTO match_players (match_id, player_id, team)
  SELECT v_match_id, unnest(p_team_a), 'team_a'::team_side
  UNION ALL
  SELECT v_match_id, unnest(p_team_b), 'team_b'::team_side;

  UPDATE queue_entries SET status = 'matched'
  WHERE session_id = p_session_id AND player_id = ANY(v_all) AND status = 'waiting';

  PERFORM recalculate_priority_scores(p_session_id);
  PERFORM recalculate_queue_positions(p_session_id);

  RETURN v_match_id;
END;
$$ LANGUAGE plpgsql;
