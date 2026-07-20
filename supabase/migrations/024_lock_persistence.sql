-- =============================================================
-- Migration 024: Locks persist across matches
-- Reverses part of migration 023: generate_match/forecast_next_sets
-- no longer delete a lock once it's consumed into a match. The same
-- lock row stays in place and is picked up again automatically the
-- next time its members cycle back to 'waiting' — it now only ever
-- goes away via an explicit host Unlock (delete_locked_set), or when
-- a member leaves the session for good (below).
-- =============================================================

-- =============================================================
-- FUNCTION: leave_session (redefined)
-- Same as migration 016, plus: dropping any lock a truly-departing
-- player belongs to. A lock left behind referencing someone who's
-- gone would never be satisfiable again (fn_select_players_for_match
-- requires every member to be 'waiting') and would just sit in the
-- host's queue view as permanently-dead, confusing UI otherwise.
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

  DELETE FROM locked_sets
  WHERE id IN (SELECT locked_set_id FROM locked_set_players WHERE player_id = p_player_id);

  PERFORM recalculate_priority_scores(v_session_id);
  PERFORM recalculate_queue_positions(v_session_id);

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- FUNCTION: generate_match (redefined)
-- Same as migration 023, minus the lock-consuming DELETE — the lock
-- now survives the match it was just used for.
-- =============================================================
CREATE OR REPLACE FUNCTION generate_match(
  p_session_id  UUID,
  p_court_id    UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_format          TEXT;
  v_anti_repeat     SMALLINT;
  v_players_needed  SMALLINT;
  v_court_id        UUID;
  v_waiting_count   INTEGER;
  v_players         UUID[];
  v_match_id        UUID;
  v_match_number    SMALLINT;
  v_team_a          UUID[];
  v_team_b          UUID[];
  v_best_cost       DECIMAL;
  v_cost            DECIMAL;
  v_sel             RECORD;
BEGIN
  PERFORM recalculate_priority_scores(p_session_id);

  SELECT match_format, anti_repeat_threshold
  INTO v_format, v_anti_repeat
  FROM session_settings
  WHERE session_id = p_session_id;

  v_players_needed := CASE WHEN v_format = 'singles' THEN 2 ELSE 4 END;

  SELECT c.id INTO v_court_id
  FROM courts c
  WHERE c.session_id = p_session_id
    AND c.status <> 'maintenance'
    AND (p_court_id IS NULL OR c.id = p_court_id)
    AND NOT EXISTS (
      SELECT 1 FROM matches m
      WHERE m.court_id = c.id AND m.status IN ('pending', 'in_progress')
    )
  ORDER BY c.court_number
  LIMIT 1
  FOR UPDATE OF c SKIP LOCKED;

  IF v_court_id IS NULL THEN
    RETURN NULL; -- no available court right now
  END IF;

  SELECT COUNT(*) INTO v_waiting_count
  FROM queue_entries
  WHERE session_id = p_session_id AND status = 'waiting';

  IF v_waiting_count < v_players_needed THEN
    RETURN NULL; -- not enough players for even one match yet
  END IF;

  SELECT * INTO v_sel FROM fn_select_players_for_match(p_session_id, v_players_needed);
  v_players := v_sel.v_players;

  IF v_players IS NULL OR array_length(v_players, 1) < v_players_needed THEN
    RETURN NULL; -- lost a race to another concurrent generation
  END IF;

  v_match_number := get_next_match_number(p_session_id);

  INSERT INTO matches (session_id, court_id, match_number, status)
  VALUES (p_session_id, v_court_id, v_match_number, 'pending')
  RETURNING id INTO v_match_id;

  IF v_sel.v_team_a IS NOT NULL THEN
    v_team_a := v_sel.v_team_a;
    v_team_b := v_sel.v_team_b;
  ELSIF v_players_needed = 2 THEN
    v_team_a := ARRAY[v_players[1]];
    v_team_b := ARRAY[v_players[2]];
  ELSE
    v_team_a := ARRAY[v_players[1], v_players[2]];
    v_team_b := ARRAY[v_players[3], v_players[4]];
    v_best_cost := fn_pairing_cost(p_session_id, v_players[1], v_players[2], v_players[3], v_players[4], v_anti_repeat);

    v_cost := fn_pairing_cost(p_session_id, v_players[1], v_players[3], v_players[2], v_players[4], v_anti_repeat);
    IF v_cost < v_best_cost THEN
      v_team_a := ARRAY[v_players[1], v_players[3]];
      v_team_b := ARRAY[v_players[2], v_players[4]];
      v_best_cost := v_cost;
    END IF;

    v_cost := fn_pairing_cost(p_session_id, v_players[1], v_players[4], v_players[2], v_players[3], v_anti_repeat);
    IF v_cost < v_best_cost THEN
      v_team_a := ARRAY[v_players[1], v_players[4]];
      v_team_b := ARRAY[v_players[2], v_players[3]];
      v_best_cost := v_cost;
    END IF;
  END IF;

  INSERT INTO match_players (match_id, player_id, team)
  SELECT v_match_id, unnest(v_team_a), 'team_a'::team_side
  UNION ALL
  SELECT v_match_id, unnest(v_team_b), 'team_b'::team_side;

  UPDATE queue_entries
  SET status = 'matched'
  WHERE session_id = p_session_id AND player_id = ANY(v_players) AND status = 'waiting';

  PERFORM recalculate_queue_positions(p_session_id);

  RETURN v_match_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- FUNCTION: forecast_next_sets (redefined)
-- Same as migration 023, minus the lock-consuming DELETE.
-- =============================================================
CREATE OR REPLACE FUNCTION forecast_next_sets(p_session_id UUID)
RETURNS VOID AS $$
DECLARE
  v_format          TEXT;
  v_anti_repeat     SMALLINT;
  v_players_needed  SMALLINT;
  v_target_count    INTEGER;
  v_current_count   INTEGER;
  v_players         UUID[];
  v_match_id        UUID;
  v_match_number    SMALLINT;
  v_team_a          UUID[];
  v_team_b          UUID[];
  v_best_cost       DECIMAL;
  v_cost            DECIMAL;
  v_sel             RECORD;
BEGIN
  PERFORM recalculate_priority_scores(p_session_id);

  SELECT match_format, anti_repeat_threshold
  INTO v_format, v_anti_repeat
  FROM session_settings
  WHERE session_id = p_session_id;

  v_players_needed := CASE WHEN v_format = 'singles' THEN 2 ELSE 4 END;

  SELECT COUNT(*) INTO v_target_count
  FROM courts
  WHERE session_id = p_session_id AND status <> 'maintenance';

  SELECT COUNT(*) INTO v_current_count
  FROM matches
  WHERE session_id = p_session_id AND status = 'forecasted' AND is_manual = false;

  IF v_current_count >= v_target_count THEN
    RETURN;
  END IF;

  LOOP
    SELECT COUNT(*) INTO v_current_count
    FROM matches
    WHERE session_id = p_session_id AND status = 'forecasted' AND is_manual = false;

    EXIT WHEN v_current_count >= v_target_count;

    SELECT * INTO v_sel FROM fn_select_players_for_match(p_session_id, v_players_needed);
    v_players := v_sel.v_players;

    EXIT WHEN v_players IS NULL OR array_length(v_players, 1) < v_players_needed;

    v_match_number := get_next_match_number(p_session_id);

    INSERT INTO matches (session_id, court_id, match_number, status, is_manual)
    VALUES (p_session_id, NULL, v_match_number, 'forecasted', false)
    RETURNING id INTO v_match_id;

    IF v_sel.v_team_a IS NOT NULL THEN
      v_team_a := v_sel.v_team_a;
      v_team_b := v_sel.v_team_b;
    ELSIF v_players_needed = 2 THEN
      v_team_a := ARRAY[v_players[1]];
      v_team_b := ARRAY[v_players[2]];
    ELSE
      v_team_a := ARRAY[v_players[1], v_players[2]];
      v_team_b := ARRAY[v_players[3], v_players[4]];
      v_best_cost := fn_pairing_cost(p_session_id, v_players[1], v_players[2], v_players[3], v_players[4], v_anti_repeat);

      v_cost := fn_pairing_cost(p_session_id, v_players[1], v_players[3], v_players[2], v_players[4], v_anti_repeat);
      IF v_cost < v_best_cost THEN
        v_team_a := ARRAY[v_players[1], v_players[3]];
        v_team_b := ARRAY[v_players[2], v_players[4]];
        v_best_cost := v_cost;
      END IF;

      v_cost := fn_pairing_cost(p_session_id, v_players[1], v_players[4], v_players[2], v_players[3], v_anti_repeat);
      IF v_cost < v_best_cost THEN
        v_team_a := ARRAY[v_players[1], v_players[4]];
        v_team_b := ARRAY[v_players[2], v_players[3]];
        v_best_cost := v_cost;
      END IF;
    END IF;

    INSERT INTO match_players (match_id, player_id, team)
    SELECT v_match_id, unnest(v_team_a), 'team_a'::team_side
    UNION ALL
    SELECT v_match_id, unnest(v_team_b), 'team_b'::team_side;

    UPDATE queue_entries
    SET status = 'matched'
    WHERE session_id = p_session_id AND player_id = ANY(v_players) AND status = 'waiting';
  END LOOP;

  PERFORM recalculate_queue_positions(p_session_id);
END;
$$ LANGUAGE plpgsql;
