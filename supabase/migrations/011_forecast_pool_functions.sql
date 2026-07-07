-- =============================================================
-- Migration 011: Forecast Pool — View & Functions
-- Implements the shared "Next Up" pool: N fully-paired, court-less
-- sets (N = number of configured courts), refilled as they're
-- consumed and promoted to whichever court frees up first.
-- =============================================================

-- =============================================================
-- VIEW: forecast_pool_view
-- Like court_status_view, but for matches not yet bound to a
-- court. Ordered oldest-first — that's the front of the line.
-- =============================================================
CREATE OR REPLACE VIEW forecast_pool_view AS
SELECT
  m.id                                                        AS match_id,
  m.session_id,
  m.match_number,
  m.created_at,
  COALESCE(
    json_agg(
      json_build_object(
        'player_id',    mp.player_id,
        'display_name', pl.display_name,
        'team',         mp.team
      ) ORDER BY mp.team, pl.display_name
    ) FILTER (WHERE mp.player_id IS NOT NULL),
    '[]'::json
  )                                                           AS players
FROM matches m
JOIN match_players mp ON mp.match_id = m.id
JOIN players pl       ON pl.id = mp.player_id
WHERE m.status = 'forecasted'
GROUP BY m.id, m.session_id, m.match_number, m.created_at
ORDER BY m.created_at ASC;

-- =============================================================
-- FUNCTION: forecast_next_sets
-- Tops up the forecast pool up to one set per configured court.
-- Same player-selection + pairing logic as generate_match (top-N
-- waiting by fairness, fn_pairing_cost for the best doubles split)
-- but with no court lock — inserts with court_id = NULL and
-- status = 'forecasted'. Stops as soon as there aren't enough
-- waiting players left for one more full set.
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

  LOOP
    SELECT COUNT(*) INTO v_current_count
    FROM matches
    WHERE session_id = p_session_id AND status = 'forecasted';

    EXIT WHEN v_current_count >= v_target_count;

    SELECT array_agg(player_id ORDER BY priority_score DESC, entered_queue ASC)
    INTO v_players
    FROM (
      SELECT player_id, priority_score, entered_queue
      FROM queue_entries
      WHERE session_id = p_session_id AND status = 'waiting'
      ORDER BY priority_score DESC, entered_queue ASC
      LIMIT v_players_needed
      FOR UPDATE SKIP LOCKED
    ) top;

    EXIT WHEN v_players IS NULL OR array_length(v_players, 1) < v_players_needed;

    v_match_number := get_next_match_number(p_session_id);

    INSERT INTO matches (session_id, court_id, match_number, status)
    VALUES (p_session_id, NULL, v_match_number, 'forecasted')
    RETURNING id INTO v_match_id;

    IF v_players_needed = 2 THEN
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
-- FUNCTION: assign_forecast_to_free_courts
-- For every currently-free court (no pending/in_progress match on
-- it), claims the oldest forecasted set and promotes it onto that
-- court (court_id set, status -> 'pending' — still requires the
-- host's own "Start Match" click, unchanged). Stops early once the
-- pool runs out, leaving remaining free courts alone. Always tops
-- the pool back up afterward.
-- =============================================================
CREATE OR REPLACE FUNCTION assign_forecast_to_free_courts(p_session_id UUID)
RETURNS VOID AS $$
DECLARE
  v_court_id UUID;
  v_match_id UUID;
BEGIN
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
    SELECT id INTO v_match_id
    FROM matches
    WHERE session_id = p_session_id AND status = 'forecasted' AND court_id IS NULL
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    EXIT WHEN v_match_id IS NULL;

    UPDATE matches SET court_id = v_court_id, status = 'pending' WHERE id = v_match_id;
  END LOOP;

  PERFORM forecast_next_sets(p_session_id);
END;
$$ LANGUAGE plpgsql;
