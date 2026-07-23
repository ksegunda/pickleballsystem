-- =============================================================
-- Migration 033: Next Up defaults to 1 set, host controls the rest
-- Previously forecast_next_sets always topped the pool up to one
-- forecasted set PER non-maintenance court. Now it tops up to a
-- per-session target_forecast_count instead, defaulting to 1. The
-- host grows that target one set at a time via increment_forecast_target
-- (the "+" button next to "Next Up") — there's no upper bound beyond
-- what fn_select_players_for_match can actually staff from the queue,
-- since the existing EXIT WHEN v_players IS NULL/short-handed guard
-- in forecast_next_sets already stops the loop the moment players run out.
-- =============================================================

ALTER TABLE session_settings
  ADD COLUMN target_forecast_count INTEGER NOT NULL DEFAULT 1
  CHECK (target_forecast_count >= 1);

-- =============================================================
-- FUNCTION: forecast_next_sets (redefined)
-- Same as migration 024, except v_target_count now comes from
-- session_settings.target_forecast_count instead of counting courts.
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

  SELECT match_format, anti_repeat_threshold, target_forecast_count
  INTO v_format, v_anti_repeat, v_target_count
  FROM session_settings
  WHERE session_id = p_session_id;

  v_players_needed := CASE WHEN v_format = 'singles' THEN 2 ELSE 4 END;

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

-- =============================================================
-- FUNCTION: increment_forecast_target
-- Backs the "+" button next to "Next Up" — grows the persistent
-- per-session target by one. Not SECURITY DEFINER — relies on the
-- existing hosts_all_own_settings RLS to scope the UPDATE to the
-- caller's own session, same pattern as shuffle_queue.
-- =============================================================
CREATE OR REPLACE FUNCTION increment_forecast_target(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE session_settings
  SET target_forecast_count = target_forecast_count + 1
  WHERE session_id = p_session_id;
END;
$$ LANGUAGE plpgsql;
