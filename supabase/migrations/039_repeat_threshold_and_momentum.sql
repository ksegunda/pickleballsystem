-- =============================================================
-- Migration 039: Real anti-repeat threshold + recent-form balance
-- =============================================================
-- Root cause of the repeated-opponent bug: fn_pairing_cost (007)
-- folded the repeat-history penalty straight into the same additive
-- cost as win-rate balance, scaled down by (0.5 / anti_repeat_threshold)
-- — at the default threshold of 3, one repeated relationship only ever
-- added ~0.167 to the cost, while win-rate balance alone ranges a full
-- 0.0-1.0 (worse early in a session when sample sizes are tiny, e.g. a
-- 1-0 player at 100% vs a 0-1 player at 0%). A single split with
-- noticeably better balance would routinely win even while repeating
-- an opponent/partner pair, because nothing ever gave repetition a
-- chance to actually decide the outcome. "anti_repeat_threshold" was
-- also never a real threshold — just a division factor, no step/cutoff
-- behavior despite the name.
--
-- Fix, in two parts:
-- 1. fn_evaluate_split now returns cost (balance + recent-form
--    momentum — no repeat term) separately from disqualified (true
--    the moment ANY single partner/opponent pair in that split has
--    already recurred >= anti_repeat_threshold times) and repeat_sum
--    (total repeat count across all 6 relationships, used only as a
--    last-resort tiebreak).
-- 2. fn_choose_team_split evaluates the 3 possible 2v2 splits and
--    picks the lowest-cost one AMONG the non-disqualified candidates
--    only. If a small/locked-in player pool means all 3 are
--    disqualified, it falls back to whichever repeats the least
--    overall (repeat_sum), not to a silent balance-only decision —
--    repetition still can't be avoided in that edge case (there are
--    only 3 splits per group of 4; once all 3 have recurred past the
--    threshold it's mathematically unavoidable), but this spreads the
--    repeats around instead of concentrating on the same pair.
--
-- New second factor — recent-form ("momentum") balance: within a
-- single team, avoid pairing two players whose LAST completed game
-- (not a multi-game average — current_win_streak/current_losing_streak
-- already track exactly this for free, no new column/query needed:
-- after any completed game exactly one of the two is > 0) were both
-- wins or both losses. momentum_penalty ranges 0 (a balanced
-- winner+loser team, or a team with no recent-result data) to 4 (both
-- teams are same-result pairs), weighted at *0.15 — enough to matter
-- as a tiebreaker without overriding a real win-rate balance gap,
-- since one game's result is a noisier signal than the session-wide
-- win rate the balance term already uses.
-- =============================================================

DROP FUNCTION IF EXISTS fn_pairing_cost(UUID, UUID, UUID, UUID, UUID, SMALLINT);

-- =============================================================
-- FUNCTION: fn_evaluate_split (internal)
-- Scores one candidate 2v2 split. cost = win-rate balance + recent-
-- form momentum penalty. repeat_sum/disqualified are reported
-- separately so the caller can gate on them instead of blending them
-- into the same number balance already dominates.
-- =============================================================
CREATE OR REPLACE FUNCTION fn_evaluate_split(
  p_session_id             UUID,
  p_a1                     UUID,
  p_a2                     UUID,
  p_b1                     UUID,
  p_b2                     UUID,
  p_anti_repeat_threshold  SMALLINT,
  OUT v_cost               DECIMAL,
  OUT v_repeat_sum         INTEGER,
  OUT v_disqualified       BOOLEAN
) AS $$
DECLARE
  v_wr_a              DECIMAL;
  v_wr_b              DECIMAL;
  v_balance           DECIMAL;
  v_partner_a         INTEGER;
  v_partner_b         INTEGER;
  v_opp_11            INTEGER;
  v_opp_12            INTEGER;
  v_opp_21            INTEGER;
  v_opp_22            INTEGER;
  v_repeat_max        INTEGER;
  v_mom_a1            SMALLINT;
  v_mom_a2            SMALLINT;
  v_mom_b1            SMALLINT;
  v_mom_b2            SMALLINT;
  v_momentum_penalty  DECIMAL;
BEGIN
  SELECT AVG(CASE WHEN games_played = 0 THEN 0.5 ELSE wins::DECIMAL / games_played END)
  INTO v_wr_a
  FROM player_statistics WHERE session_id = p_session_id AND player_id IN (p_a1, p_a2);

  SELECT AVG(CASE WHEN games_played = 0 THEN 0.5 ELSE wins::DECIMAL / games_played END)
  INTO v_wr_b
  FROM player_statistics WHERE session_id = p_session_id AND player_id IN (p_b1, p_b2);

  v_balance := ABS(COALESCE(v_wr_a, 0.5) - COALESCE(v_wr_b, 0.5));

  SELECT times_partnered INTO v_partner_a
  FROM partner_history WHERE session_id = p_session_id AND player_id = p_a1 AND partner_id = p_a2;

  SELECT times_partnered INTO v_partner_b
  FROM partner_history WHERE session_id = p_session_id AND player_id = p_b1 AND partner_id = p_b2;

  SELECT times_faced INTO v_opp_11
  FROM opponent_history WHERE session_id = p_session_id AND player_id = p_a1 AND opponent_id = p_b1;

  SELECT times_faced INTO v_opp_12
  FROM opponent_history WHERE session_id = p_session_id AND player_id = p_a1 AND opponent_id = p_b2;

  SELECT times_faced INTO v_opp_21
  FROM opponent_history WHERE session_id = p_session_id AND player_id = p_a2 AND opponent_id = p_b1;

  SELECT times_faced INTO v_opp_22
  FROM opponent_history WHERE session_id = p_session_id AND player_id = p_a2 AND opponent_id = p_b2;

  v_repeat_sum := COALESCE(v_partner_a, 0) + COALESCE(v_partner_b, 0) +
                  COALESCE(v_opp_11, 0) + COALESCE(v_opp_12, 0) +
                  COALESCE(v_opp_21, 0) + COALESCE(v_opp_22, 0);

  v_repeat_max := GREATEST(
    COALESCE(v_partner_a, 0), COALESCE(v_partner_b, 0),
    COALESCE(v_opp_11, 0), COALESCE(v_opp_12, 0),
    COALESCE(v_opp_21, 0), COALESCE(v_opp_22, 0)
  );

  v_disqualified := v_repeat_max >= p_anti_repeat_threshold;

  -- Recent form: current_win_streak/current_losing_streak are reset to
  -- 0 the instant the opposite result happens, so exactly one of the
  -- two is > 0 for anyone with games_played > 0 — this already IS
  -- "was their last completed game a win or a loss," no extra query
  -- over match history needed.
  SELECT CASE WHEN current_win_streak > 0 THEN 1 WHEN current_losing_streak > 0 THEN -1 ELSE 0 END
  INTO v_mom_a1 FROM player_statistics WHERE session_id = p_session_id AND player_id = p_a1;

  SELECT CASE WHEN current_win_streak > 0 THEN 1 WHEN current_losing_streak > 0 THEN -1 ELSE 0 END
  INTO v_mom_a2 FROM player_statistics WHERE session_id = p_session_id AND player_id = p_a2;

  SELECT CASE WHEN current_win_streak > 0 THEN 1 WHEN current_losing_streak > 0 THEN -1 ELSE 0 END
  INTO v_mom_b1 FROM player_statistics WHERE session_id = p_session_id AND player_id = p_b1;

  SELECT CASE WHEN current_win_streak > 0 THEN 1 WHEN current_losing_streak > 0 THEN -1 ELSE 0 END
  INTO v_mom_b2 FROM player_statistics WHERE session_id = p_session_id AND player_id = p_b2;

  -- Per team: |sum of the two players' momentum| — 0 when the team is
  -- winner+loser (or has no recent-result data), 2 when it's a
  -- winner+winner or loser+loser pair.
  v_momentum_penalty :=
    ABS(COALESCE(v_mom_a1, 0) + COALESCE(v_mom_a2, 0)) +
    ABS(COALESCE(v_mom_b1, 0) + COALESCE(v_mom_b2, 0));

  v_cost := v_balance + (v_momentum_penalty * 0.15);
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================
-- FUNCTION: fn_choose_team_split (internal)
-- Evaluates the 3 possible 2v2 splits of 4 players and picks one —
-- shared by generate_match and forecast_next_sets so this decision
-- logic exists in exactly one place.
-- =============================================================
CREATE OR REPLACE FUNCTION fn_choose_team_split(
  p_session_id             UUID,
  p_p1                     UUID,
  p_p2                     UUID,
  p_p3                     UUID,
  p_p4                     UUID,
  p_anti_repeat_threshold  SMALLINT,
  OUT v_team_a             UUID[],
  OUT v_team_b             UUID[]
) AS $$
DECLARE
  v_split1          RECORD;
  v_split2          RECORD;
  v_split3          RECORD;
  v_best_cost       DECIMAL;
  v_best_repeat_sum INTEGER;
BEGIN
  SELECT * INTO v_split1 FROM fn_evaluate_split(p_session_id, p_p1, p_p2, p_p3, p_p4, p_anti_repeat_threshold);
  SELECT * INTO v_split2 FROM fn_evaluate_split(p_session_id, p_p1, p_p3, p_p2, p_p4, p_anti_repeat_threshold);
  SELECT * INTO v_split3 FROM fn_evaluate_split(p_session_id, p_p1, p_p4, p_p2, p_p3, p_anti_repeat_threshold);

  IF NOT (v_split1.v_disqualified AND v_split2.v_disqualified AND v_split3.v_disqualified) THEN
    -- At least one candidate is clean — pick the lowest cost among
    -- only the non-disqualified ones. A disqualified split is never
    -- selected here regardless of how good its balance/momentum cost
    -- looks.
    v_best_cost := NULL;

    IF NOT v_split1.v_disqualified THEN
      v_team_a := ARRAY[p_p1, p_p2]; v_team_b := ARRAY[p_p3, p_p4];
      v_best_cost := v_split1.v_cost;
    END IF;

    IF NOT v_split2.v_disqualified AND (v_best_cost IS NULL OR v_split2.v_cost < v_best_cost) THEN
      v_team_a := ARRAY[p_p1, p_p3]; v_team_b := ARRAY[p_p2, p_p4];
      v_best_cost := v_split2.v_cost;
    END IF;

    IF NOT v_split3.v_disqualified AND (v_best_cost IS NULL OR v_split3.v_cost < v_best_cost) THEN
      v_team_a := ARRAY[p_p1, p_p4]; v_team_b := ARRAY[p_p2, p_p3];
      v_best_cost := v_split3.v_cost;
    END IF;
  ELSE
    -- Every split repeats some pair past the threshold — the pool is
    -- too small/locked-in to avoid it entirely. Pick whichever repeats
    -- the LEAST overall (repeat_sum), tie-broken by cost, instead of
    -- silently falling back to a balance-only decision.
    v_team_a := ARRAY[p_p1, p_p2]; v_team_b := ARRAY[p_p3, p_p4];
    v_best_repeat_sum := v_split1.v_repeat_sum;
    v_best_cost        := v_split1.v_cost;

    IF v_split2.v_repeat_sum < v_best_repeat_sum
       OR (v_split2.v_repeat_sum = v_best_repeat_sum AND v_split2.v_cost < v_best_cost) THEN
      v_team_a := ARRAY[p_p1, p_p3]; v_team_b := ARRAY[p_p2, p_p4];
      v_best_repeat_sum := v_split2.v_repeat_sum;
      v_best_cost        := v_split2.v_cost;
    END IF;

    IF v_split3.v_repeat_sum < v_best_repeat_sum
       OR (v_split3.v_repeat_sum = v_best_repeat_sum AND v_split3.v_cost < v_best_cost) THEN
      v_team_a := ARRAY[p_p1, p_p4]; v_team_b := ARRAY[p_p2, p_p3];
      v_best_repeat_sum := v_split3.v_repeat_sum;
      v_best_cost        := v_split3.v_cost;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================
-- FUNCTION: generate_match (redefined)
-- Same as migration 024, except the inline 3-candidate comparison is
-- now fn_choose_team_split.
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
  v_sel             RECORD;
  v_split           RECORD;
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
    SELECT * INTO v_split FROM fn_choose_team_split(p_session_id, v_players[1], v_players[2], v_players[3], v_players[4], v_anti_repeat);
    v_team_a := v_split.v_team_a;
    v_team_b := v_split.v_team_b;
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
-- Same as migration 033, except the inline 3-candidate comparison is
-- now fn_choose_team_split.
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
  v_sel             RECORD;
  v_split           RECORD;
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
      SELECT * INTO v_split FROM fn_choose_team_split(p_session_id, v_players[1], v_players[2], v_players[3], v_players[4], v_anti_repeat);
      v_team_a := v_split.v_team_a;
      v_team_b := v_split.v_team_b;
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
