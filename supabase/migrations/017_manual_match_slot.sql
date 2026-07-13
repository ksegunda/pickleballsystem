-- =============================================================
-- Migration 017: Manual match slot + drag-drop team editing
-- Adds a host-curated third "Next Up" slot alongside the two
-- auto-generated forecast slots, plus the ability to drag players
-- between teams on any not-yet-started set (auto or manual). Plain
-- column addition, safe to use in the same transaction/migration
-- that adds it (unlike the queue_entry_status 'resting' enum value
-- from migration 015, which needed its own separate migration).
-- =============================================================

ALTER TABLE matches ADD COLUMN is_manual BOOLEAN NOT NULL DEFAULT false;

-- =============================================================
-- FUNCTION: fn_validate_team_split (internal)
-- Shared validation for both functions below: both teams must be
-- non-empty, their combined size must equal p_expected_total, and
-- no player may appear twice (within a team or across both).
--
-- Written defensively around a real Postgres gotcha: array_length
-- of a genuinely empty array returns NULL, not 0 (no dimension-1
-- bound to report) — a naive `<> array_length(...)` comparison
-- against an empty array evaluates to NULL under three-valued
-- logic, and `IF NULL THEN` never fires, silently letting an empty
-- team through. COALESCE(..., 0) up front avoids that trap.
-- =============================================================
CREATE OR REPLACE FUNCTION fn_validate_team_split(
  p_team_a          UUID[],
  p_team_b          UUID[],
  p_expected_total  INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_a_len INTEGER := COALESCE(array_length(p_team_a, 1), 0);
  v_b_len INTEGER := COALESCE(array_length(p_team_b, 1), 0);
BEGIN
  IF v_a_len = 0 OR v_b_len = 0 THEN
    RETURN false; -- both teams must have at least one player
  END IF;

  IF v_a_len + v_b_len <> p_expected_total THEN
    RETURN false;
  END IF;

  IF (SELECT COUNT(DISTINCT x) FROM unnest(p_team_a || p_team_b) x) <> p_expected_total THEN
    RETURN false; -- duplicate/overlapping player within or across teams
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- VIEW: forecast_pool_view (redefined)
-- Same as migration 011, plus is_manual so the app can tell a
-- host-curated set apart from an auto-generated one. is_manual is
-- appended AFTER players (not inserted before it) on purpose —
-- CREATE OR REPLACE VIEW can only add new columns at the end of the
-- existing column list; inserting one in the middle reads as
-- renaming the columns after it, which Postgres rejects.
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
  )                                                           AS players,
  m.is_manual
FROM matches m
JOIN match_players mp ON mp.match_id = m.id
JOIN players pl       ON pl.id = mp.player_id
WHERE m.status = 'forecasted'
GROUP BY m.id, m.session_id, m.match_number, m.created_at, m.is_manual
ORDER BY m.created_at ASC;

-- =============================================================
-- FUNCTION: forecast_next_sets (redefined)
-- Same as migration 013, with is_manual = false added to BOTH
-- places this version counts the pool (the pre-loop early-exit and
-- the in-loop EXIT WHEN) — missing either one under-provisions the
-- two auto slots for as long as a manual match sits in the pool,
-- since a manual set would otherwise count toward "the pool is full
-- enough" without occupying one of the auto slots it's being
-- measured against.
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

    INSERT INTO matches (session_id, court_id, match_number, status, is_manual)
    VALUES (p_session_id, NULL, v_match_number, 'forecasted', false)
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
-- FUNCTION: update_match_teams
-- Drag-and-drop save: reassigns which team each currently-seated
-- player is on for a not-yet-started set (forecasted or pending —
-- either an auto or a manual one, editing works the same either
-- way). Host-only action, relies on existing RLS
-- (hosts_all_match_players) — not SECURITY DEFINER, same pattern as
-- generate_match/finish_match.
--
-- FOR UPDATE on the status check re-confirms the match hasn't
-- started since the modal opened. Concurrency note: this can only
-- ever make assign_forecast_to_free_courts's SKIP LOCKED promotion
-- pass skip this exact match for one cycle if it collides — it
-- never blocks on this lock, so there's no deadlock risk, and this
-- function never touches status/court_id, only match_players.team,
-- so a promotion landing right after this commits is unaffected.
-- =============================================================
CREATE OR REPLACE FUNCTION update_match_teams(
  p_match_id  UUID,
  p_team_a    UUID[],
  p_team_b    UUID[]
)
RETURNS BOOLEAN AS $$
DECLARE
  v_status  match_status;
  v_seated  INTEGER;
BEGIN
  SELECT status INTO v_status FROM matches WHERE id = p_match_id FOR UPDATE;

  IF v_status IS NULL OR v_status NOT IN ('forecasted', 'pending') THEN
    RETURN false; -- not found/not owned (RLS), or already started/gone
  END IF;

  SELECT COUNT(*) INTO v_seated FROM match_players WHERE match_id = p_match_id;

  IF NOT fn_validate_team_split(p_team_a, p_team_b, v_seated) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT player_id FROM match_players WHERE match_id = p_match_id
    EXCEPT
    SELECT unnest(p_team_a || p_team_b)
  ) THEN
    RETURN false; -- submitted teams don't match who's actually seated
  END IF;

  UPDATE match_players SET team = 'team_a' WHERE match_id = p_match_id AND player_id = ANY(p_team_a);
  UPDATE match_players SET team = 'team_b' WHERE match_id = p_match_id AND player_id = ANY(p_team_b);

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- FUNCTION: create_manual_match
-- Host-curated match: session_id + who the host picked for each
-- team. Inserted straight into the forecast pool (court_id=NULL,
-- status='forecasted', is_manual=true) so it rides the same
-- promotion/start/finish lifecycle every other forecasted match
-- already uses — no separate code path needed for it to eventually
-- get played.
--
-- Enforces exactly one active manual match at a time (the "third
-- slot" is a singleton, not an open-ended list) and that every
-- chosen player is actually 'waiting' in this session's queue right
-- now. Does NOT re-derive the fairness window (roughly top 10 by
-- queue order) — that's enforced client-side only, confirmed as a
-- host-trust decision, not a security boundary, same reasoning as
-- every other host-only function in this schema.
-- =============================================================
CREATE OR REPLACE FUNCTION create_manual_match(
  p_session_id  UUID,
  p_team_a      UUID[],
  p_team_b      UUID[]
)
RETURNS UUID AS $$
DECLARE
  v_match_id      UUID;
  v_match_number  SMALLINT;
  v_all           UUID[];
  v_expected      INTEGER;
  v_locked_count  INTEGER;
BEGIN
  v_all      := p_team_a || p_team_b;
  v_expected := COALESCE(array_length(p_team_a, 1), 0) + COALESCE(array_length(p_team_b, 1), 0);

  IF NOT fn_validate_team_split(p_team_a, p_team_b, v_expected) THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM matches
    WHERE session_id = p_session_id AND is_manual = true AND status IN ('forecasted', 'pending')
    FOR UPDATE
  ) THEN
    RETURN NULL; -- only one manual slot at a time
  END IF;

  -- Lock these exact players' waiting queue rows so a concurrent
  -- generate_match/forecast_next_sets can't grab one of them first.
  -- Split into two statements because Postgres disallows combining
  -- FOR UPDATE with an aggregate function in the same query.
  PERFORM 1 FROM queue_entries
  WHERE session_id = p_session_id AND player_id = ANY(v_all) AND status = 'waiting'
  FOR UPDATE;

  SELECT COUNT(*) INTO v_locked_count
  FROM queue_entries
  WHERE session_id = p_session_id AND player_id = ANY(v_all) AND status = 'waiting';

  IF v_locked_count <> v_expected THEN
    RETURN NULL; -- someone selected in the UI is no longer actually waiting
  END IF;

  v_match_number := get_next_match_number(p_session_id);

  INSERT INTO matches (session_id, court_id, match_number, status, is_manual)
  VALUES (p_session_id, NULL, v_match_number, 'forecasted', true)
  RETURNING id INTO v_match_id;

  INSERT INTO match_players (match_id, player_id, team)
  SELECT v_match_id, unnest(p_team_a), 'team_a'::team_side
  UNION ALL
  SELECT v_match_id, unnest(p_team_b), 'team_b'::team_side;

  UPDATE queue_entries SET status = 'matched'
  WHERE session_id = p_session_id AND player_id = ANY(v_all) AND status = 'waiting';

  PERFORM recalculate_priority_scores(p_session_id);
  PERFORM recalculate_queue_positions(p_session_id);

  RETURN v_match_id;
END;
$$ LANGUAGE plpgsql;
