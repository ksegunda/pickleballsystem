-- =============================================================
-- Migration 032: Shuffle queue
-- An explicit, host-triggered override — reassigns entered_queue for
-- every currently-waiting player to a new random relative order, then
-- recalculates priority_score/position off that. Deliberately a real
-- reorder (not a second parallel "display order" living alongside the
-- real fairness data) — clicking Shuffle is meant to visibly reset
-- fair wait-time order, and the UI confirms that plainly before this
-- runs. Not SECURITY DEFINER — relies on the existing hosts_all_queue
-- RLS policy to scope the UPDATE to the caller's own session, same
-- pattern as generate_match/create_manual_match.
-- =============================================================
CREATE OR REPLACE FUNCTION shuffle_queue(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
  WITH shuffled AS (
    SELECT
      id,
      row_number() OVER (ORDER BY random()) AS rn,
      count(*) OVER ()                      AS total
    FROM queue_entries
    WHERE session_id = p_session_id AND status = 'waiting'
  )
  UPDATE queue_entries qe
  SET entered_queue = now() - ((shuffled.total - shuffled.rn) * interval '1 second')
  FROM shuffled
  WHERE qe.id = shuffled.id;

  PERFORM recalculate_priority_scores(p_session_id);
  PERFORM recalculate_queue_positions(p_session_id);
END;
$$ LANGUAGE plpgsql;
