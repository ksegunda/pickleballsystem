-- =============================================================
-- Fix: apply Singles format (for real this time) + re-queue the
-- 20 test players stuck at queue_entries.status = 'matched'
-- with no waiting row, even though players.status = 'waiting'.
--
-- Session: "Palo" (07a6aba7-2775-423d-8253-1eb761b7ee9b)
-- Your 4 real players (patrick, cm, Bench, alexis) already have a
-- correct waiting queue_entries row — the WHERE NOT EXISTS below
-- means this script does not touch them at all.
-- =============================================================

-- 1) Actually apply Singles this time, with immediate verification.
UPDATE session_settings
SET match_format = 'singles'
WHERE session_id = '07a6aba7-2775-423d-8253-1eb761b7ee9b';

SELECT session_id, match_format, updated_at
FROM session_settings
WHERE session_id = '07a6aba7-2775-423d-8253-1eb761b7ee9b';
-- ^ Confirm this prints match_format = 'singles' before moving on.
--   If it still shows 'doubles', the UPDATE above did not run —
--   check you're connected to the right Supabase project.

-- 2) Re-queue any "waiting" player who has no waiting queue_entries
-- row at all. Safe to re-run: once a player has a waiting row, the
-- NOT EXISTS check skips them on subsequent runs.
INSERT INTO queue_entries (session_id, player_id, status, entered_queue, priority_score)
SELECT p.session_id, p.id, 'waiting', now(), 0
FROM players p
WHERE p.session_id = '07a6aba7-2775-423d-8253-1eb761b7ee9b'
  AND p.is_active = true
  AND p.status = 'waiting'
  AND NOT EXISTS (
    SELECT 1 FROM queue_entries qe
    WHERE qe.player_id = p.id AND qe.status = 'waiting'
  );

-- 3) Recompute fairness ordering so the Queue page is correct
-- immediately (same functions the app calls after a real join/finish).
SELECT recalculate_priority_scores('07a6aba7-2775-423d-8253-1eb761b7ee9b');
SELECT recalculate_queue_positions('07a6aba7-2775-423d-8253-1eb761b7ee9b');

-- 4) Verify: should now show 24 total waiting queue_entries.
SELECT status, COUNT(*)
FROM queue_entries
WHERE session_id = '07a6aba7-2775-423d-8253-1eb761b7ee9b'
GROUP BY status;
