-- =============================================================
-- Migration 013: Priority Score Performance
--
-- recalculate_priority_scores() previously called calculate_priority_score()
-- once per waiting player via a row-by-row UPDATE. Each of those calls ran
-- 5 queries on its own, two of which (session-wide MAX wait time, MAX games
-- played, AVG win rate) recomputed the exact same session-wide aggregate
-- from scratch for every single player. For a session with N waiting
-- players that's ~5N queries, including two O(N) scans repeated N times,
-- to do work that only needs those aggregates computed once.
--
-- This migration:
--  1) Rewrites recalculate_priority_scores as a single set-based UPDATE
--     that computes the session-wide settings/bounds/average exactly once
--     and joins them against all waiting rows in one statement. Same
--     formula, same results, ~5N queries collapsed into a handful.
--  2) Adds an early-exit to forecast_next_sets so it skips calling
--     recalculate_priority_scores entirely when the forecast pool is
--     already full. This function is called from
--     assign_forecast_to_free_courts on every single getCourtsBoard()
--     read (every Courts page load + every realtime refresh), so most
--     calls do nothing useful and shouldn't pay for a recalculation.
--
-- calculate_priority_score() itself is left in place (no longer called
-- from the hot path, but harmless to keep for manual/debug use).
-- =============================================================

-- =============================================================
-- FUNCTION: recalculate_priority_scores (set-based rewrite)
-- Same weighted formula as calculate_priority_score(), computed for all
-- waiting players in one statement instead of one function call per row.
-- =============================================================
CREATE OR REPLACE FUNCTION recalculate_priority_scores(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE queue_entries qe
  SET priority_score = ROUND(
    ctx.weight_waiting_time * (
      CASE WHEN ctx.max_wait > 0
           THEN w.waiting_secs::DECIMAL / ctx.max_wait
           ELSE 0 END
    ) +
    ctx.weight_games_played * (
      CASE WHEN ctx.max_games > 0
           THEN 1.0 - (w.games_played::DECIMAL / ctx.max_games)
           ELSE 1.0 END
    ) +
    ctx.weight_performance * (
      1.0 - ABS(
        (CASE WHEN w.games_played = 0 THEN 0.5 ELSE w.wins::DECIMAL / w.games_played END)
        - ctx.avg_wr
      )
    ),
    4
  )
  FROM (
    SELECT
      qe2.id,
      EXTRACT(EPOCH FROM (now() - qe2.entered_queue))::INTEGER AS waiting_secs,
      COALESCE(ps.games_played, 0) AS games_played,
      COALESCE(ps.wins, 0)         AS wins
    FROM queue_entries qe2
    LEFT JOIN player_statistics ps
      ON ps.player_id = qe2.player_id AND ps.session_id = qe2.session_id
    WHERE qe2.session_id = p_session_id AND qe2.status = 'waiting'
  ) w
  CROSS JOIN (
    SELECT
      s.weight_waiting_time,
      s.weight_games_played,
      s.weight_performance,
      bounds.max_wait,
      bounds.max_games,
      COALESCE(avgwr.avg_wr, 0.5) AS avg_wr
    FROM session_settings s
    CROSS JOIN (
      SELECT
        MAX(EXTRACT(EPOCH FROM (now() - qe3.entered_queue))::INTEGER) AS max_wait,
        MAX(COALESCE(ps3.games_played, 0))                            AS max_games
      FROM queue_entries qe3
      LEFT JOIN player_statistics ps3
        ON ps3.player_id = qe3.player_id AND ps3.session_id = qe3.session_id
      WHERE qe3.session_id = p_session_id AND qe3.status = 'waiting'
    ) bounds
    CROSS JOIN (
      SELECT AVG(CASE WHEN games_played = 0 THEN 0.5 ELSE wins::DECIMAL / games_played END) AS avg_wr
      FROM player_statistics
      WHERE session_id = p_session_id
    ) avgwr
    WHERE s.session_id = p_session_id
  ) ctx
  WHERE qe.id = w.id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- FUNCTION: forecast_next_sets (early-exit guard added)
-- Identical generation logic to migration 011 — only change is checking
-- whether the pool actually needs topping up BEFORE paying for a priority
-- score recalculation, instead of recalculating unconditionally every call.
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
  WHERE session_id = p_session_id AND status = 'forecasted';

  -- Pool already full — nothing to generate, so skip the recalculation
  -- below entirely. This is the common case on a plain board read.
  IF v_current_count >= v_target_count THEN
    RETURN;
  END IF;

  PERFORM recalculate_priority_scores(p_session_id);

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
