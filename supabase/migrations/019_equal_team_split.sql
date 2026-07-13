-- =============================================================
-- Migration 019: Equal team split validation
-- fn_validate_team_split (migration 017) checked both teams were
-- non-empty and the combined total matched, but never that the two
-- teams were the same size — a 3-vs-1 split passed as long as the
-- total was right. Every match in this schema is doubles (2v2) or
-- singles (1v1), both even splits, so "equal" is unambiguous here.
-- Redefining closes the gap for both callers that share this
-- function: update_match_teams (drag-drop) and create_manual_match.
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

  IF v_a_len <> v_b_len THEN
    RETURN false; -- teams must be evenly split
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
