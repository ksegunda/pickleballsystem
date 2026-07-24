-- =============================================================
-- Migration 040: Widen the candidate pool when the strict top-4 is
-- deadlocked on repeats
-- =============================================================
-- migration 039 made anti-repeat a real hard threshold instead of a
-- weak soft cost — correct, but it can only ever choose AMONG the 3
-- splits of the exact same 4 people fn_select_players_for_match
-- already drew. As a session goes on, a small pool of similarly-
-- prioritized players keeps cycling to the front together, and once
-- all 3 splits of that exact group have repeated past the threshold,
-- there is nothing left to pick from — the fallback (least total
-- repeats) spreads the damage around but can't eliminate it. This is
-- the "same 4 people forever" symptom reported after 039 shipped.
--
-- Fix: fn_select_players_for_match now checks, for doubles only,
-- whether its own strict top-4 draw is deadlocked (all 3 splits
-- disqualified) BEFORE committing to it. Only in that specific case
-- does it widen the search to rank 2-8 (fn_widen_selection) — the #1
-- priority player is always kept as a fixed anchor either way, so the
-- single most-deserving person never gets bumped. The normal case
-- (at least one clean split in the strict top-4) is completely
-- unchanged — this widening path only ever activates on genuine
-- deadlock, not routinely.
-- =============================================================

-- =============================================================
-- FUNCTION: fn_widen_selection (internal)
-- Searches every 3-of-7 combination from rank 2-8 (paired with the
-- fixed anchor) for the lowest-cost NON-disqualified 2v2 split,
-- lightly biased toward candidates closer to the front of that
-- widened pool. Returns NULL if even this wider pool can't produce a
-- clean split (an extremely small/fully-cycled active pool) — the
-- caller falls back to the strict top-4 in that case, same as before
-- this migration.
-- =============================================================
CREATE OR REPLACE FUNCTION fn_widen_selection(
  p_session_id             UUID,
  p_anchor_id              UUID,
  p_anti_repeat_threshold  SMALLINT
)
RETURNS UUID[] AS $$
DECLARE
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
  -- Rank 2-8 among everyone else waiting (the anchor is handled
  -- separately, always guaranteed a seat). Same fair ordering as
  -- every other draw in this schema; FOR UPDATE SKIP LOCKED so a
  -- losing concurrent generation call can't grab someone already
  -- claimed elsewhere.
  SELECT array_agg(player_id ORDER BY priority_score DESC, entered_queue ASC)
  INTO v_pool
  FROM (
    SELECT player_id, priority_score, entered_queue
    FROM queue_entries
    WHERE session_id = p_session_id AND status = 'waiting' AND player_id <> p_anchor_id
    ORDER BY priority_score DESC, entered_queue ASC
    LIMIT 7
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

        -- How far into the widened pool this particular trio reaches —
        -- rank 2 (i=1) contributes 0, rank 8 (i=7) contributes 6. Small
        -- weight: only meant to break ties toward the front of the
        -- queue, never to outweigh actually finding a clean split.
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
-- FUNCTION: fn_select_players_for_match (redefined)
-- Same as migration 026, plus a new anti_repeat_threshold parameter
-- and a deadlock check on the natural draw: for doubles, if every
-- possible split of the strict top-4 repeats some partner/opponent
-- pair past the threshold, fn_widen_selection gets a shot at finding
-- a clean group instead — the #1 priority player carries over as the
-- fixed anchor either way. Falls back to the natural top-4 unchanged
-- if widening can't do any better (matches migration 039's existing
-- least-repeats fallback in the caller).
--
-- The old 2-parameter signature is dropped explicitly first — adding
-- a parameter makes this a different overload as far as Postgres is
-- concerned, so CREATE OR REPLACE alone would leave the old version
-- behind as dead code instead of actually replacing it.
-- =============================================================
DROP FUNCTION IF EXISTS fn_select_players_for_match(UUID, SMALLINT);

CREATE OR REPLACE FUNCTION fn_select_players_for_match(
  p_session_id             UUID,
  p_players_needed         SMALLINT,
  p_anti_repeat_threshold  SMALLINT,
  OUT v_players            UUID[],
  OUT v_team_a             UUID[],
  OUT v_team_b             UUID[],
  OUT v_locked_set_id      UUID
) AS $$
DECLARE
  v_natural       UUID[];
  v_lock_id       UUID;
  v_lock_type     TEXT;
  v_lock_players  UUID[];
  v_locked_count  INTEGER;
  v_fill_needed   INTEGER;
  v_fill          UUID[];
  v_s1            RECORD;
  v_s2            RECORD;
  v_s3            RECORD;
  v_widened       UUID[];
BEGIN
  v_team_a := NULL;
  v_team_b := NULL;
  v_locked_set_id := NULL;

  -- Step 1: the exact same plain fair-order draw that existed before the
  -- lock feature — zero lock-awareness. This is the only thing that
  -- decides WHEN/WHO is next.
  SELECT array_agg(player_id ORDER BY priority_score DESC, entered_queue ASC)
  INTO v_natural
  FROM (
    SELECT player_id, priority_score, entered_queue
    FROM queue_entries
    WHERE session_id = p_session_id AND status = 'waiting'
    ORDER BY priority_score DESC, entered_queue ASC
    LIMIT p_players_needed
    FOR UPDATE SKIP LOCKED
  ) top;

  IF v_natural IS NULL OR array_length(v_natural, 1) < p_players_needed THEN
    v_players := v_natural;
    RETURN; -- not enough waiting players right now
  END IF;

  -- Step 2 (doubles only): did the natural draw already include an
  -- "anchor" — someone whose lock's other members are all currently
  -- waiting too? Pick the highest-priority such anchor if more than one
  -- landed in the same draw (a match can only satisfy one lock).
  IF p_players_needed = 4 THEN
    SELECT ls.id, ls.lock_type
    INTO v_lock_id, v_lock_type
    FROM locked_set_players lsp_anchor
    JOIN locked_sets ls ON ls.id = lsp_anchor.locked_set_id
    WHERE ls.session_id = p_session_id
      AND lsp_anchor.player_id = ANY(v_natural)
      AND NOT EXISTS (
        SELECT 1 FROM locked_set_players lsp
        WHERE lsp.locked_set_id = ls.id
          AND NOT EXISTS (
            SELECT 1 FROM queue_entries qe
            WHERE qe.session_id = p_session_id
              AND qe.player_id = lsp.player_id
              AND qe.status = 'waiting'
          )
      )
    ORDER BY array_position(v_natural, lsp_anchor.player_id) ASC
    LIMIT 1
    FOR UPDATE OF ls SKIP LOCKED;

    IF v_lock_id IS NOT NULL THEN
      SELECT array_agg(player_id) INTO v_lock_players
      FROM locked_set_players WHERE locked_set_id = v_lock_id;

      -- Re-lock + re-verify (race-safety) — same two-statement pattern
      -- used elsewhere in this schema.
      PERFORM 1 FROM queue_entries
      WHERE session_id = p_session_id AND player_id = ANY(v_lock_players) AND status = 'waiting'
      FOR UPDATE;

      SELECT COUNT(*) INTO v_locked_count
      FROM queue_entries
      WHERE session_id = p_session_id AND player_id = ANY(v_lock_players) AND status = 'waiting';

      IF v_locked_count = array_length(v_lock_players, 1) THEN
        IF v_lock_type = 'full_match' THEN
          SELECT array_agg(player_id) FILTER (WHERE team = 'team_a'),
                 array_agg(player_id) FILTER (WHERE team = 'team_b')
          INTO v_team_a, v_team_b
          FROM locked_set_players WHERE locked_set_id = v_lock_id;

          v_players := v_team_a || v_team_b;
          v_locked_set_id := v_lock_id;
          RETURN;
        ELSE -- partner_pair: fill the remaining seat(s) by fair order, excluding the pair
          v_fill_needed := p_players_needed - array_length(v_lock_players, 1);

          SELECT array_agg(player_id ORDER BY priority_score DESC, entered_queue ASC)
          INTO v_fill
          FROM (
            SELECT player_id, priority_score, entered_queue
            FROM queue_entries
            WHERE session_id = p_session_id AND status = 'waiting'
              AND player_id <> ALL(v_lock_players)
            ORDER BY priority_score DESC, entered_queue ASC
            LIMIT v_fill_needed
            FOR UPDATE SKIP LOCKED
          ) top;

          IF v_fill IS NOT NULL AND array_length(v_fill, 1) = v_fill_needed THEN
            v_team_a := v_lock_players;
            v_team_b := v_fill;
            v_players := v_lock_players || v_fill;
            v_locked_set_id := v_lock_id;
            RETURN;
          END IF;
          -- couldn't fill around the pair (lost a race) — fall through
        END IF;
      END IF;
    END IF;
  END IF;

  -- Step 3 (doubles only, no lock triggered): is the natural top-4 draw
  -- actually usable? If every one of its 3 possible splits repeats some
  -- partner/opponent pair past the threshold, this exact group is
  -- deadlocked — widen the search rather than committing to it anyway.
  -- The #1 priority player (v_natural[1]) is preserved as the anchor
  -- either way.
  IF p_players_needed = 4 THEN
    SELECT * INTO v_s1 FROM fn_evaluate_split(p_session_id, v_natural[1], v_natural[2], v_natural[3], v_natural[4], p_anti_repeat_threshold);
    SELECT * INTO v_s2 FROM fn_evaluate_split(p_session_id, v_natural[1], v_natural[3], v_natural[2], v_natural[4], p_anti_repeat_threshold);
    SELECT * INTO v_s3 FROM fn_evaluate_split(p_session_id, v_natural[1], v_natural[4], v_natural[2], v_natural[3], p_anti_repeat_threshold);

    IF v_s1.v_disqualified AND v_s2.v_disqualified AND v_s3.v_disqualified THEN
      v_widened := fn_widen_selection(p_session_id, v_natural[1], p_anti_repeat_threshold);
      IF v_widened IS NOT NULL THEN
        v_players := v_widened;
        RETURN;
      END IF;
      -- widening couldn't find anything clean either — fall through to
      -- the natural top-4; the caller's existing least-repeats fallback
      -- (migration 039) takes it from here.
    END IF;
  END IF;

  -- No anchor triggered, and either not deadlocked or widening didn't
  -- help — the natural, fully unmodified fair-order draw stands as-is.
  v_players := v_natural;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- FUNCTION: generate_match (redefined)
-- Same as migration 039, except fn_select_players_for_match now takes
-- anti_repeat_threshold as an explicit argument.
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

  SELECT * INTO v_sel FROM fn_select_players_for_match(p_session_id, v_players_needed, v_anti_repeat);
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
-- Same as migration 039, except fn_select_players_for_match now takes
-- anti_repeat_threshold as an explicit argument.
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

    SELECT * INTO v_sel FROM fn_select_players_for_match(p_session_id, v_players_needed, v_anti_repeat);
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
