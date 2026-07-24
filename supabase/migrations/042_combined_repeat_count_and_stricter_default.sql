-- =============================================================
-- Migration 042: Combined repeat count + stricter default threshold
-- =============================================================
-- Root cause, confirmed against real session data (not guessed):
--
-- (a) anti_repeat_threshold defaulted to 3 — the hard-disqualify gate
--     (migration 039) only rejects a split once some pair has met
--     >= 3 times, meaning a 1st AND 2nd re-encounter both sail through
--     with zero friction. That alone explains most of what was
--     observed (e.g. Oyo/Camille facing each other twice with only 1
--     prior encounter at decision time — 1 < 3, never disqualified).
--
-- (b) A second, more important gap: fn_evaluate_split checked
--     partner_history and opponent_history as two INDEPENDENT
--     numbers. Two players who partnered last round and are now being
--     considered as OPPONENTS look "fresh" (opponent count = 0) even
--     though they were just on the same court together — this is
--     exactly what happened with Erika/Oyo (partners in match #17,
--     opponents in #22, immediately after) and Bea/Oyo (opponents in
--     #17, partners in #22). Neither flip was ever caught, because
--     each relationship type's counter starts at 0 independent of the
--     other.
--
-- Fix: fn_pair_repeat_count treats "have these two already met" as
-- ONE combined number (times_partnered + times_faced) regardless of
-- which role they're being considered for now, and the default
-- threshold drops to 1 — any prior encounter at all disqualifies a
-- split unless every alternative has the same problem. Since disquali-
-- fication will now trigger far more often, fn_widen_selection's pool
-- also grows from a fixed 7 to scale with how many players are
-- actually waiting, so there's still a meaningfully large set of
-- alternatives to search on the (now much more common) deadlock path.
-- =============================================================

-- =============================================================
-- FUNCTION: fn_pair_repeat_count (internal)
-- "How many times have these two players already encountered each
-- other, in ANY capacity" — partnered or opposed both count toward
-- the same total. Both history tables are written symmetrically in
-- both directions (migration 004's trigger), so a single-direction
-- lookup is sufficient.
-- =============================================================
CREATE OR REPLACE FUNCTION fn_pair_repeat_count(
  p_session_id  UUID,
  p_x           UUID,
  p_y           UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_partner   INTEGER;
  v_opponent  INTEGER;
BEGIN
  SELECT times_partnered INTO v_partner
  FROM partner_history WHERE session_id = p_session_id AND player_id = p_x AND partner_id = p_y;

  SELECT times_faced INTO v_opponent
  FROM opponent_history WHERE session_id = p_session_id AND player_id = p_x AND opponent_id = p_y;

  RETURN COALESCE(v_partner, 0) + COALESCE(v_opponent, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================
-- FUNCTION: fn_evaluate_split (redefined)
-- Same signature/role as migration 039, except the 6 pairwise repeat
-- counts now come from fn_pair_repeat_count (partner + opponent
-- combined) instead of checking only whichever relationship type the
-- pair happens to hold in THIS candidate split.
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
  v_pair_aa           INTEGER;
  v_pair_bb           INTEGER;
  v_pair_a1b1         INTEGER;
  v_pair_a1b2         INTEGER;
  v_pair_a2b1         INTEGER;
  v_pair_a2b2         INTEGER;
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

  -- Each of the 6 relevant pairs in a 2v2 split, checked as a single
  -- combined "have they met before" count regardless of which role
  -- (partner/opponent) they held last time or are being proposed for now.
  v_pair_aa   := fn_pair_repeat_count(p_session_id, p_a1, p_a2);
  v_pair_bb   := fn_pair_repeat_count(p_session_id, p_b1, p_b2);
  v_pair_a1b1 := fn_pair_repeat_count(p_session_id, p_a1, p_b1);
  v_pair_a1b2 := fn_pair_repeat_count(p_session_id, p_a1, p_b2);
  v_pair_a2b1 := fn_pair_repeat_count(p_session_id, p_a2, p_b1);
  v_pair_a2b2 := fn_pair_repeat_count(p_session_id, p_a2, p_b2);

  v_repeat_sum := v_pair_aa + v_pair_bb + v_pair_a1b1 + v_pair_a1b2 + v_pair_a2b1 + v_pair_a2b2;
  v_repeat_max := GREATEST(v_pair_aa, v_pair_bb, v_pair_a1b1, v_pair_a1b2, v_pair_a2b1, v_pair_a2b2);

  v_disqualified := v_repeat_max >= p_anti_repeat_threshold;

  SELECT CASE WHEN current_win_streak > 0 THEN 1 WHEN current_losing_streak > 0 THEN -1 ELSE 0 END
  INTO v_mom_a1 FROM player_statistics WHERE session_id = p_session_id AND player_id = p_a1;

  SELECT CASE WHEN current_win_streak > 0 THEN 1 WHEN current_losing_streak > 0 THEN -1 ELSE 0 END
  INTO v_mom_a2 FROM player_statistics WHERE session_id = p_session_id AND player_id = p_a2;

  SELECT CASE WHEN current_win_streak > 0 THEN 1 WHEN current_losing_streak > 0 THEN -1 ELSE 0 END
  INTO v_mom_b1 FROM player_statistics WHERE session_id = p_session_id AND player_id = p_b1;

  SELECT CASE WHEN current_win_streak > 0 THEN 1 WHEN current_losing_streak > 0 THEN -1 ELSE 0 END
  INTO v_mom_b2 FROM player_statistics WHERE session_id = p_session_id AND player_id = p_b2;

  v_momentum_penalty :=
    ABS(COALESCE(v_mom_a1, 0) + COALESCE(v_mom_a2, 0)) +
    ABS(COALESCE(v_mom_b1, 0) + COALESCE(v_mom_b2, 0));

  v_cost := v_balance + (v_momentum_penalty * 0.15);
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================
-- FUNCTION: fn_widen_selection (redefined)
-- Same as migration 040, except the widened pool now scales with how
-- many players are actually waiting (LEAST(waiting_count_excluding_
-- anchor, 12)) instead of a fixed 7 — with the threshold dropping to
-- 1, the deadlock path this pool serves will trigger far more often,
-- so it needs a meaningfully larger set of alternatives to search.
-- =============================================================
CREATE OR REPLACE FUNCTION fn_widen_selection(
  p_session_id             UUID,
  p_anchor_id              UUID,
  p_anti_repeat_threshold  SMALLINT
)
RETURNS UUID[] AS $$
DECLARE
  v_waiting_count INTEGER;
  v_pool_limit    INTEGER;
  v_pool          UUID[];
  v_pool_size     INTEGER;
  i               INTEGER;
  j               INTEGER;
  k               INTEGER;
  v_p2            UUID;
  v_p3            UUID;
  v_p4            UUID;
  v_distance      DECIMAL;
  v_s1            RECORD;
  v_s2            RECORD;
  v_s3            RECORD;
  v_best_score    DECIMAL;
  v_best_team_a   UUID[];
  v_best_team_b   UUID[];
BEGIN
  SELECT COUNT(*) INTO v_waiting_count
  FROM queue_entries
  WHERE session_id = p_session_id AND status = 'waiting' AND player_id <> p_anchor_id;

  v_pool_limit := LEAST(v_waiting_count, 12);

  SELECT array_agg(player_id ORDER BY priority_score DESC, entered_queue ASC)
  INTO v_pool
  FROM (
    SELECT player_id, priority_score, entered_queue
    FROM queue_entries
    WHERE session_id = p_session_id AND status = 'waiting' AND player_id <> p_anchor_id
    ORDER BY priority_score DESC, entered_queue ASC
    LIMIT v_pool_limit
    FOR UPDATE SKIP LOCKED
  ) top;

  v_pool_size := COALESCE(array_length(v_pool, 1), 0);
  IF v_pool_size < 3 THEN
    RETURN NULL; -- not even enough waiting players to fill a widened group
  END IF;

  v_best_score := NULL;

  FOR i IN 1..v_pool_size LOOP
    FOR j IN (i + 1)..v_pool_size LOOP
      FOR k IN (j + 1)..v_pool_size LOOP
        v_p2 := v_pool[i];
        v_p3 := v_pool[j];
        v_p4 := v_pool[k];

        v_distance := ((i - 1) + (j - 1) + (k - 1)) * 0.05;

        SELECT * INTO v_s1 FROM fn_evaluate_split(p_session_id, p_anchor_id, v_p2, v_p3, v_p4, p_anti_repeat_threshold);
        SELECT * INTO v_s2 FROM fn_evaluate_split(p_session_id, p_anchor_id, v_p3, v_p2, v_p4, p_anti_repeat_threshold);
        SELECT * INTO v_s3 FROM fn_evaluate_split(p_session_id, p_anchor_id, v_p4, v_p2, v_p3, p_anti_repeat_threshold);

        IF NOT v_s1.v_disqualified AND (v_best_score IS NULL OR v_s1.v_cost + v_distance < v_best_score) THEN
          v_best_score  := v_s1.v_cost + v_distance;
          v_best_team_a := ARRAY[p_anchor_id, v_p2];
          v_best_team_b := ARRAY[v_p3, v_p4];
        END IF;

        IF NOT v_s2.v_disqualified AND (v_best_score IS NULL OR v_s2.v_cost + v_distance < v_best_score) THEN
          v_best_score  := v_s2.v_cost + v_distance;
          v_best_team_a := ARRAY[p_anchor_id, v_p3];
          v_best_team_b := ARRAY[v_p2, v_p4];
        END IF;

        IF NOT v_s3.v_disqualified AND (v_best_score IS NULL OR v_s3.v_cost + v_distance < v_best_score) THEN
          v_best_score  := v_s3.v_cost + v_distance;
          v_best_team_a := ARRAY[p_anchor_id, v_p4];
          v_best_team_b := ARRAY[v_p2, v_p3];
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  IF v_best_team_a IS NULL THEN
    RETURN NULL; -- nothing in the widened pool is clean either
  END IF;

  RETURN v_best_team_a || v_best_team_b;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- Stricter default anti_repeat_threshold (3 -> 1), plus a one-time
-- backfill so already-running sessions (created before this
-- migration, with the old default baked into their settings row)
-- get the fix immediately rather than only on their next session.
-- =============================================================
ALTER TABLE session_settings
  ALTER COLUMN anti_repeat_threshold SET DEFAULT 1;

UPDATE session_settings
SET anti_repeat_threshold = 1
WHERE anti_repeat_threshold = 3;
