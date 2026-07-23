-- =============================================================
-- Migration 035: Validate match completeness before it goes live
-- move_player (migration 034) only ever enforces per-team capacity,
-- never the match's total headcount — deliberately, so a host can
-- freely drag one player at a time without the primitive rejecting
-- every transient in-between state, and so a LIVE court can be left
-- at 2v1 on purpose (e.g. an injury sub). But nothing downstream of
-- that ever re-checked the total before letting a set go live: a
-- forecasted/pending match a host left short-handed (or unbalanced)
-- via the roster editor could still be promoted to a court and
-- Started with the wrong number of players.
--
-- Closes that gap at the two points that actually matter — becoming
-- promotable, and becoming live — using the same fn_validate_team_split
-- (migrations 017/019) create_manual_match already relies on. Both
-- redefinitions are scoped to forecasted/pending matches only; a
-- match that's already in_progress never runs through either of
-- these functions again, so the intentional live 2v1 allowance is
-- untouched.
-- =============================================================

-- =============================================================
-- FUNCTION: assign_forecast_to_free_courts (redefined)
-- Same promotion loop as migration 011, except the forecasted-match
-- lookup now excludes any match whose current match_players don't
-- add up to a complete, even split. An incomplete set simply isn't
-- selected — the loop moves on to the next-oldest valid one instead
-- of stalling, and the incomplete set stays visible in the pool
-- (unpromoted) until the host finishes editing it.
-- =============================================================
CREATE OR REPLACE FUNCTION assign_forecast_to_free_courts(p_session_id UUID)
RETURNS VOID AS $$
DECLARE
  v_court_id        UUID;
  v_match_id        UUID;
  v_players_needed  SMALLINT;
BEGIN
  SELECT CASE WHEN match_format = 'singles' THEN 2 ELSE 4 END
  INTO v_players_needed
  FROM session_settings WHERE session_id = p_session_id;

  FOR v_court_id IN
    SELECT c.id
    FROM courts c
    WHERE c.session_id = p_session_id
      AND c.status <> 'maintenance'
      AND NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE m.court_id = c.id AND m.status IN ('pending', 'in_progress')
      )
    ORDER BY c.court_number
    FOR UPDATE OF c SKIP LOCKED
  LOOP
    SELECT m.id INTO v_match_id
    FROM matches m
    WHERE m.session_id = p_session_id AND m.status = 'forecasted' AND m.court_id IS NULL
      AND fn_validate_team_split(
        (SELECT array_agg(mp.player_id) FROM match_players mp WHERE mp.match_id = m.id AND mp.team = 'team_a'),
        (SELECT array_agg(mp.player_id) FROM match_players mp WHERE mp.match_id = m.id AND mp.team = 'team_b'),
        v_players_needed
      )
    ORDER BY m.created_at ASC
    LIMIT 1
    FOR UPDATE OF m SKIP LOCKED;

    EXIT WHEN v_match_id IS NULL;

    UPDATE matches SET court_id = v_court_id, status = 'pending' WHERE id = v_match_id;
  END LOOP;

  PERFORM forecast_next_sets(p_session_id);
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- FUNCTION: start_match (redefined)
-- Same pending -> in_progress flip as migration 008, now gated on
-- the match's current match_players actually adding up to a
-- complete, even split for this session's format. Returns false
-- (same "couldn't do it" contract as every other false-returning
-- case here) rather than a distinct error, so a stale/left-short
-- roster edit surfaces through the exact same host-facing toast
-- path startMatchAction already has.
-- =============================================================
CREATE OR REPLACE FUNCTION start_match(p_match_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_session_id      UUID;
  v_players_needed  SMALLINT;
  v_team_a          UUID[];
  v_team_b          UUID[];
  v_updated         INTEGER;
BEGIN
  SELECT session_id INTO v_session_id
  FROM matches WHERE id = p_match_id AND status = 'pending';

  IF v_session_id IS NULL THEN
    RETURN false; -- not found, not owned (RLS), or not pending
  END IF;

  SELECT CASE WHEN match_format = 'singles' THEN 2 ELSE 4 END
  INTO v_players_needed
  FROM session_settings WHERE session_id = v_session_id;

  SELECT
    array_agg(player_id) FILTER (WHERE team = 'team_a'),
    array_agg(player_id) FILTER (WHERE team = 'team_b')
  INTO v_team_a, v_team_b
  FROM match_players WHERE match_id = p_match_id;

  IF NOT fn_validate_team_split(v_team_a, v_team_b, v_players_needed) THEN
    RETURN false; -- roster editor left this short-handed or unbalanced
  END IF;

  UPDATE matches
  SET status = 'in_progress', started_at = now()
  WHERE id = p_match_id AND status = 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql;
