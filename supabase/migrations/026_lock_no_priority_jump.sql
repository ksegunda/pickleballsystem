-- =============================================================
-- Migration 026: Locks no longer jump the fair queue
-- Fixes a real bug in fn_select_players_for_match (023/024): it
-- checked "does any satisfiable lock exist anywhere in the queue"
-- BEFORE running the plain fair-order draw, so the instant both
-- locked players cycled back to 'waiting' after a match, they got
-- swept into the very next match regardless of their (freshly low)
-- priority_score/entered_queue relative to everyone else waiting —
-- a genuine priority jump, not what "guarantee they're paired" was
-- ever supposed to mean.
--
-- Correct model ("anchor-triggered"): the plain fair-order draw runs
-- FIRST, completely unmodified, exactly as if locks didn't exist —
-- this alone still decides WHEN/WHO is next, no exceptions. ONLY IF
-- that natural draw happens to already include one of a lock's
-- members (an "anchor" — someone who reached the front on their own,
-- fully earned, zero shortcut) does the lock activate: it swaps in
-- the anchor's locked partner(s) to fill the remaining seat(s)
-- instead of the next fair-order players, and dictates the team
-- split instead of fn_pairing_cost. A locked player whose partner
-- hasn't independently reached the front yet is not, by itself,
-- pulled into anything early — only being drawn first (on their own
-- merits) can trigger it.
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
  v_natural       UUID[];
  v_lock_id       UUID;
  v_lock_type     TEXT;
  v_lock_players  UUID[];
  v_locked_count  INTEGER;
  v_fill_needed   INTEGER;
  v_fill          UUID[];
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

  -- No anchor triggered (or lock resolution lost a race) — the natural,
  -- fully unmodified fair-order draw stands as-is.
  v_players := v_natural;
END;
$$ LANGUAGE plpgsql;
