-- =============================================================
-- Migration 025: End Session no longer deletes data
-- Reverses migration 014's purge. Ending a session now only flips
-- its status — every table still cascades from sessions(id) with
-- ON DELETE CASCADE (migration 001), so nothing here needed to
-- change for the real deletion path: that's now exclusively
-- SessionRepository.delete(id) (a plain `DELETE FROM sessions`,
-- already existed), triggered only by an explicit host action from
-- the "Past Sessions" list — never automatically.
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

  UPDATE sessions SET status = 'ended', ended_at = now() WHERE id = p_session_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;
