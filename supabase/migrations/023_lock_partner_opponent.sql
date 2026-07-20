-- =============================================================
-- Migration 023: Lock Partner / Lock Full Match
-- Lets a host pin players together before the automatic matchmaker
-- ever sees them. Two variants:
--   partner_pair (2 players): guaranteed to land on the same team
--     in their next match; their opponents still come from the
--     normal fairness queue.
--   full_match (4 players): the entire 2v2 pairing is predetermined
--     — no other queue player is involved in this match at all.
-- Doubles-only by design (v_players_needed = 4 in both consuming
-- functions) — singles has no partner/opponent distinction to lock.
-- A player can only be in one active lock at a time; the lock is
-- consumed (deleted) the moment its players actually get seated
-- into a real match, so it only ever affects the *next* match, not
-- every future one. Unlocking early is just deleting the row.
-- =============================================================

CREATE TABLE locked_sets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  lock_type   TEXT NOT NULL CHECK (lock_type IN ('partner_pair', 'full_match')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- team is NULL for partner_pair rows (togetherness is the only
-- constraint — which absolute side they land on doesn't matter) and
-- always set for full_match rows (the complete 2v2 split is fixed
-- at creation time, so there's nothing left for the algorithm to
-- decide).
CREATE TABLE locked_set_players (
  locked_set_id UUID NOT NULL REFERENCES locked_sets(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team          team_side,
  PRIMARY KEY (locked_set_id, player_id)
);

ALTER TABLE locked_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hosts_all_locked_sets"
  ON locked_sets FOR ALL
  USING (
    session_id IN (SELECT id FROM sessions WHERE host_id = auth.uid())
  );

ALTER TABLE locked_set_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hosts_all_locked_set_players"
  ON locked_set_players FOR ALL
  USING (
    locked_set_id IN (
      SELECT ls.id FROM locked_sets ls
      JOIN sessions s ON s.id = ls.session_id
      WHERE s.host_id = auth.uid()
    )
  );

-- =============================================================
-- VIEW: locked_players_view
-- One row per locked player, for the Courts screen's queue list to
-- look up "is this player locked, and how" without a separate query
-- per row.
-- =============================================================
CREATE OR REPLACE VIEW locked_players_view AS
SELECT
  ls.session_id,
  ls.id         AS locked_set_id,
  ls.lock_type,
  ls.created_at,
  lsp.player_id,
  lsp.team
FROM locked_sets ls
JOIN locked_set_players lsp ON lsp.locked_set_id = ls.id;

-- =============================================================
-- FUNCTION: create_locked_set
-- Host action: pin 2 players (partner_pair) or 4 players with a
-- full 2v2 split (full_match, p_teams parallel to p_players by
-- array position). Returns the new locked_set id, or NULL if the
-- selection is invalid or overlaps an existing active lock.
-- =============================================================
CREATE OR REPLACE FUNCTION create_locked_set(
  p_session_id  UUID,
  p_lock_type   TEXT,
  p_players     UUID[],
  p_teams       team_side[] DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_locked_set_id  UUID;
  v_expected       INTEGER;
  v_distinct       INTEGER;
  v_a_count        INTEGER;
  v_b_count        INTEGER;
  v_already_locked INTEGER;
  v_in_session     INTEGER;
BEGIN
  IF p_lock_type NOT IN ('partner_pair', 'full_match') THEN
    RETURN NULL;
  END IF;

  v_expected := CASE WHEN p_lock_type = 'partner_pair' THEN 2 ELSE 4 END;

  IF COALESCE(array_length(p_players, 1), 0) <> v_expected THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(DISTINCT x) INTO v_distinct FROM unnest(p_players) x;
  IF v_distinct <> v_expected THEN
    RETURN NULL; -- duplicate player in the selection
  END IF;

  IF p_lock_type = 'full_match' THEN
    IF COALESCE(array_length(p_teams, 1), 0) <> 4 THEN
      RETURN NULL;
    END IF;

    SELECT COUNT(*) FILTER (WHERE t = 'team_a'), COUNT(*) FILTER (WHERE t = 'team_b')
    INTO v_a_count, v_b_count
    FROM unnest(p_teams) t;

    IF v_a_count <> 2 OR v_b_count <> 2 THEN
      RETURN NULL; -- must be an even 2v2 split
    END IF;
  END IF;

  -- None of these players may already be part of another active lock
  -- in this session.
  SELECT COUNT(*) INTO v_already_locked
  FROM locked_set_players lsp
  JOIN locked_sets ls ON ls.id = lsp.locked_set_id
  WHERE ls.session_id = p_session_id AND lsp.player_id = ANY(p_players);

  IF v_already_locked > 0 THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO v_in_session
  FROM players
  WHERE session_id = p_session_id AND id = ANY(p_players);

  IF v_in_session <> v_expected THEN
    RETURN NULL; -- someone selected doesn't belong to this session
  END IF;

  INSERT INTO locked_sets (session_id, lock_type)
  VALUES (p_session_id, p_lock_type)
  RETURNING id INTO v_locked_set_id;

  IF p_lock_type = 'full_match' THEN
    INSERT INTO locked_set_players (locked_set_id, player_id, team)
    SELECT v_locked_set_id, p_players[i], p_teams[i]
    FROM generate_series(1, 4) AS i;
  ELSE
    INSERT INTO locked_set_players (locked_set_id, player_id, team)
    SELECT v_locked_set_id, unnest(p_players), NULL;
  END IF;

  RETURN v_locked_set_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- FUNCTION: delete_locked_set
-- Unlock: just removes the lock (cascades to locked_set_players).
-- RLS (hosts_all_locked_sets) is the only authorization check.
-- =============================================================
CREATE OR REPLACE FUNCTION delete_locked_set(p_locked_set_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM locked_sets WHERE id = p_locked_set_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- FUNCTION: fn_select_players_for_match (internal)
-- Shared by generate_match and forecast_next_sets. Picks the
-- players for one match, preferring the oldest active lock whose
-- members are ALL currently 'waiting' (doubles only):
--   full_match  -> returns all 4 players with v_team_a/v_team_b
--                  already fully decided (the caller skips its own
--                  3-way split evaluation entirely).
--   partner_pair -> returns the 2 locked players plus the next
--                  (p_players_needed - 2) players by plain fairness
--                  order to fill the match; v_team_a is the locked
--                  pair, v_team_b is the fill — again fully decided,
--                  since with 2 of 4 players constrained to the same
--                  side there is exactly one valid split.
-- No satisfiable lock (or singles format) -> falls through to the
-- existing plain top-N priority selection, v_team_a/v_team_b left
-- NULL so the caller runs its normal cost-based split unchanged.
-- =============================================================
CREATE OR REPLACE FUNCTION fn_select_players_for_match(
  p_session_id      UUID,
  p_players_needed  SMALLINT,
  OUT v_players       UUID[],
  OUT v_team_a        UUID[],
  OUT v_team_b        UUID[],
  OUT v_locked_set_id UUID
) AS $$
DECLARE
  v_lock_id      UUID;
  v_lock_type    TEXT;
  v_lock_players UUID[];
  v_locked_count INTEGER;
  v_fill         UUID[];
  v_resolved     BOOLEAN := false;
BEGIN
  v_team_a := NULL;
  v_team_b := NULL;
  v_locked_set_id := NULL;

  IF p_players_needed = 4 THEN
    SELECT ls.id, ls.lock_type
    INTO v_lock_id, v_lock_type
    FROM locked_sets ls
    WHERE ls.session_id = p_session_id
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
    ORDER BY ls.created_at ASC
    LIMIT 1
    FOR UPDATE OF ls SKIP LOCKED;

    IF v_lock_id IS NOT NULL THEN
      SELECT array_agg(player_id) INTO v_lock_players
      FROM locked_set_players WHERE locked_set_id = v_lock_id;

      -- Re-lock these exact queue rows and re-verify none were
      -- claimed by a concurrent generate_match/forecast_next_sets
      -- call between the check above and now — same two-statement
      -- pattern create_manual_match uses (FOR UPDATE can't combine
      -- with an aggregate in one query).
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
          v_resolved := true;
        ELSE -- partner_pair
          SELECT array_agg(player_id ORDER BY priority_score DESC, entered_queue ASC)
          INTO v_fill
          FROM (
            SELECT player_id, priority_score, entered_queue
            FROM queue_entries
            WHERE session_id = p_session_id AND status = 'waiting'
              AND player_id <> ALL(v_lock_players)
            ORDER BY priority_score DESC, entered_queue ASC
            LIMIT (p_players_needed - 2)
            FOR UPDATE SKIP LOCKED
          ) top;

          IF v_fill IS NOT NULL AND array_length(v_fill, 1) = (p_players_needed - 2) THEN
            v_team_a := v_lock_players;
            v_team_b := v_fill;
            v_players := v_lock_players || v_fill;
            v_locked_set_id := v_lock_id;
            v_resolved := true;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  IF NOT v_resolved THEN
    v_team_a := NULL;
    v_team_b := NULL;
    v_locked_set_id := NULL;

    SELECT array_agg(player_id ORDER BY priority_score DESC, entered_queue ASC)
    INTO v_players
    FROM (
      SELECT player_id, priority_score, entered_queue
      FROM queue_entries
      WHERE session_id = p_session_id AND status = 'waiting'
      ORDER BY priority_score DESC, entered_queue ASC
      LIMIT p_players_needed
      FOR UPDATE SKIP LOCKED
    ) top;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- FUNCTION: generate_match (redefined)
-- Same as migration 007, with player selection delegated to
-- fn_select_players_for_match so a satisfiable lock is honored; the
-- 3-way cost-based split only runs when nothing decided the teams
-- already. Consumes (deletes) the lock once its match_players row
-- actually gets inserted.
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

  IF v_sel.v_locked_set_id IS NOT NULL THEN
    DELETE FROM locked_sets WHERE id = v_sel.v_locked_set_id;
  END IF;

  PERFORM recalculate_queue_positions(p_session_id);

  RETURN v_match_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- FUNCTION: forecast_next_sets (redefined)
-- Same as migration 017, with the same lock-aware selection swap
-- as generate_match above, applied per loop iteration.
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

    IF v_sel.v_locked_set_id IS NOT NULL THEN
      DELETE FROM locked_sets WHERE id = v_sel.v_locked_set_id;
    END IF;
  END LOOP;

  PERFORM recalculate_queue_positions(p_session_id);
END;
$$ LANGUAGE plpgsql;
