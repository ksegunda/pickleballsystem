-- =============================================================
-- Migration 036: Revert roster editing to same-match team swaps only
-- move_player (migration 034) let a host drag a player anywhere —
-- queue, any Next Up set, any court, including pulling someone off a
-- LIVE match. Decided that scope was too broad: editing should only
-- ever rearrange who's on which team WITHIN the match a host opened
-- to edit — never add, remove, or relocate a player relative to that
-- match. Dropping move_player entirely rather than narrowing its
-- parameters, so there's no primitive left in the DB that a caller
-- could point at a different match/queue even in principle.
--
-- Restores update_match_teams exactly as migration 019 left it —
-- same validation (fn_validate_team_split for an even split, plus an
-- exact-match check that the submitted roster is precisely who's
-- already seated, no adds/drops) — nothing about that logic needed
-- to change, it already was the "same-match only" primitive before
-- migration 034 replaced it.
--
-- migration 035's start_match/assign_forecast_to_free_courts
-- validation is left as-is — with this revert a match's headcount can
-- no longer drift via the roster editor at all, so that check is now
-- pure defense-in-depth rather than load-bearing, but there's no
-- reason to pull it back out.
-- =============================================================

DROP FUNCTION IF EXISTS move_player(UUID, UUID, team_side);

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
-- started since the modal opened.
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
