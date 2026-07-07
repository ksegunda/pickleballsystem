-- =============================================================
-- Migration 007: Match Generation
-- Per-court, threshold-based match generation. A match can be
-- generated for any single court as soon as enough players are
-- waiting for one match's worth — never gated on the whole
-- session/other courts being full.
-- =============================================================

-- =============================================================
-- FUNCTION: recalculate_priority_scores
-- Refreshes priority_score for every waiting player in a session
-- using calculate_priority_score(). Nothing else in the schema
-- populates this column, so this must run before ordering the
-- queue for display or match generation.
-- =============================================================
CREATE OR REPLACE FUNCTION recalculate_priority_scores(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE queue_entries qe
  SET priority_score = calculate_priority_score(qe.player_id, p_session_id)
  WHERE qe.session_id = p_session_id AND qe.status = 'waiting';
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- FUNCTION: fn_pairing_cost (internal)
-- Scores one candidate 2v2 team split: lower is better.
-- Combines win-rate balance with repeat partner/opponent history.
-- =============================================================
CREATE OR REPLACE FUNCTION fn_pairing_cost(
  p_session_id              UUID,
  p_a1                      UUID,
  p_a2                      UUID,
  p_b1                      UUID,
  p_b2                      UUID,
  p_anti_repeat_threshold   SMALLINT
)
RETURNS DECIMAL AS $$
DECLARE
  v_wr_a            DECIMAL;
  v_wr_b            DECIMAL;
  v_balance         DECIMAL;
  v_partner_a       INTEGER;
  v_partner_b       INTEGER;
  v_opp_11          INTEGER;
  v_opp_12          INTEGER;
  v_opp_21          INTEGER;
  v_opp_22          INTEGER;
  v_repeat_penalty  DECIMAL;
BEGIN
  SELECT AVG(CASE WHEN games_played = 0 THEN 0.5 ELSE wins::DECIMAL / games_played END)
  INTO v_wr_a
  FROM player_statistics WHERE session_id = p_session_id AND player_id IN (p_a1, p_a2);

  SELECT AVG(CASE WHEN games_played = 0 THEN 0.5 ELSE wins::DECIMAL / games_played END)
  INTO v_wr_b
  FROM player_statistics WHERE session_id = p_session_id AND player_id IN (p_b1, p_b2);

  v_balance := ABS(COALESCE(v_wr_a, 0.5) - COALESCE(v_wr_b, 0.5));

  SELECT COALESCE(times_partnered, 0) INTO v_partner_a
  FROM partner_history
  WHERE session_id = p_session_id AND player_id = p_a1 AND partner_id = p_a2;

  SELECT COALESCE(times_partnered, 0) INTO v_partner_b
  FROM partner_history
  WHERE session_id = p_session_id AND player_id = p_b1 AND partner_id = p_b2;

  SELECT COALESCE(times_faced, 0) INTO v_opp_11
  FROM opponent_history WHERE session_id = p_session_id AND player_id = p_a1 AND opponent_id = p_b1;

  SELECT COALESCE(times_faced, 0) INTO v_opp_12
  FROM opponent_history WHERE session_id = p_session_id AND player_id = p_a1 AND opponent_id = p_b2;

  SELECT COALESCE(times_faced, 0) INTO v_opp_21
  FROM opponent_history WHERE session_id = p_session_id AND player_id = p_a2 AND opponent_id = p_b1;

  SELECT COALESCE(times_faced, 0) INTO v_opp_22
  FROM opponent_history WHERE session_id = p_session_id AND player_id = p_a2 AND opponent_id = p_b2;

  v_repeat_penalty := (
    COALESCE(v_partner_a, 0) + COALESCE(v_partner_b, 0) +
    COALESCE(v_opp_11, 0) + COALESCE(v_opp_12, 0) + COALESCE(v_opp_21, 0) + COALESCE(v_opp_22, 0)
  ) / GREATEST(p_anti_repeat_threshold, 1)::DECIMAL;

  RETURN v_balance + (v_repeat_penalty * 0.5);
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================
-- FUNCTION: generate_match
-- Atomically generates ONE match for ONE court, as soon as there
-- are enough waiting players for a single match — independent of
-- how many other courts or players exist. Re-validates eligibility
-- itself (court freedom + player count) so it's safe under
-- concurrent calls. Returns the new match id, or NULL if not
-- eligible right now (no available court, or not enough players).
--
-- A court counts as "free" when it has no match in ('pending',
-- 'in_progress') — matching court_status_view — not merely when
-- courts.status = 'available' (that flag only flips at match
-- START, so relying on it alone could double-book a court that
-- already has a generated-but-not-yet-started match).
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
BEGIN
  PERFORM recalculate_priority_scores(p_session_id);

  SELECT match_format, anti_repeat_threshold
  INTO v_format, v_anti_repeat
  FROM session_settings
  WHERE session_id = p_session_id;

  v_players_needed := CASE WHEN v_format = 'singles' THEN 2 ELSE 4 END;

  -- Lock one free court: the requested one if given, else the
  -- lowest-numbered free court. "Free" = not under maintenance and
  -- no pending/in_progress match already on it.
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

  -- Lock and take the top-N waiting players by fairness priority
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

  IF v_players IS NULL OR array_length(v_players, 1) < v_players_needed THEN
    RETURN NULL; -- lost a race to another concurrent generation
  END IF;

  v_match_number := get_next_match_number(p_session_id);

  INSERT INTO matches (session_id, court_id, match_number, status)
  VALUES (p_session_id, v_court_id, v_match_number, 'pending')
  RETURNING id INTO v_match_id;

  IF v_players_needed = 2 THEN
    v_team_a := ARRAY[v_players[1]];
    v_team_b := ARRAY[v_players[2]];
  ELSE
    -- Evaluate all 3 possible 2v2 splits of the 4 selected players,
    -- pick the one with the lowest balance + repeat-history cost.
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
