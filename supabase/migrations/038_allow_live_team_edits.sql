-- =============================================================
-- Migration 038: Allow team edits on a live (in_progress) match
-- update_match_teams (migrations 017/019, restored by 036) only ever
-- accepted forecasted/pending matches — a leftover from when it was
-- purely a "before the match starts" tool. The host now explicitly
-- wants to re-pair teams mid-game too (e.g. correcting a mistake
-- after Start Match), and since this function only ever swaps
-- players who are already seated (never adds/removes anyone), there's
-- no headcount/validation gap reopened by allowing it here — the
-- exact-split check (fn_validate_team_split) still applies exactly
-- the same regardless of which of the three statuses this runs on.
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

  IF v_status IS NULL OR v_status NOT IN ('forecasted', 'pending', 'in_progress') THEN
    RETURN false; -- not found/not owned (RLS), or already completed/cancelled
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
