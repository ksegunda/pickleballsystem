-- =============================================================
-- Migration 014: End Session
-- Atomically transitions an active session to 'ended' and purges
-- all guest player data tied to it. Everything below runs inside
-- one PL/pgSQL function body, which Postgres executes as a single
-- transaction — either every statement succeeds or none do, so
-- there is no partial-delete state possible.
--
-- Deletion order matters for FK integrity:
--   1. players      -- cascades to queue_entries, match_players,
--                       player_statistics, partner_history,
--                       opponent_history (all ON DELETE CASCADE
--                       on their player_id/partner_id/opponent_id
--                       FKs from migration 001)
--   2. matches      -- must come before courts, since
--                       matches.court_id has no cascade
--   3. courts
--
-- The `sessions` row itself is never deleted — only its status
-- and ended_at are updated — so session history (and any `reports`
-- row a caller inserted beforehand) survives.
--
-- Not SECURITY DEFINER: runs as the calling host, so the existing
-- RLS policies (hosts_all_own_courts/players/matches/sessions)
-- naturally scope every statement to that host's own session —
-- same pattern as generate_match/finish_match elsewhere in this
-- schema.
-- =============================================================
CREATE OR REPLACE FUNCTION end_session(p_session_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_status session_status;
BEGIN
  SELECT status INTO v_status FROM sessions WHERE id = p_session_id FOR UPDATE;

  IF v_status IS NULL OR v_status <> 'active' THEN
    RETURN false; -- not found, not owned (RLS), or already not active
  END IF;

  DELETE FROM players WHERE session_id = p_session_id;
  DELETE FROM matches  WHERE session_id = p_session_id;
  DELETE FROM courts   WHERE session_id = p_session_id;

  UPDATE sessions SET status = 'ended', ended_at = now() WHERE id = p_session_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;
