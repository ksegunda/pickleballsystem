-- =============================================================
-- Seed: 20 test players directly into a session's queue
-- Bypasses the QR/join-code flow entirely — inserts straight into
-- players + player_statistics + queue_entries as "waiting".
--
-- HOW TO USE:
-- 1. Replace the value of v_session_id below with your session's
--    real ID (see the helper SELECT above the script to find it).
-- 2. Run this whole file in Supabase Dashboard -> SQL Editor.
-- 3. Your Queue page should immediately show 20 waiting players,
--    ordered fairly (longest-waiting first) once you load it —
--    the script calls the same recalculate functions the app uses.
-- =============================================================

-- Run this first if you don't already have the session_id handy.
-- Copy the "id" of the row you want from the result.
-- SELECT id, session_name, club_name, status, created_at
-- FROM sessions
-- ORDER BY created_at DESC;

DO $$
DECLARE
  -- <<< REPLACE THIS with your real session id (uuid) >>>
  v_session_id UUID := '00000000-0000-0000-0000-000000000000';

  v_names TEXT[] := ARRAY[
    'Jomar','Kim','Ana','Mark','Cherry','Rey','Liza','Jun','Grace','Paolo',
    'Ivy','Noel','Rica','Boyet','Che','Ronnie','Tin','Dexter','Joy','Marlon'
  ];
  v_player_id UUID;
  v_joined    TIMESTAMPTZ;
  i           INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sessions WHERE id = v_session_id) THEN
    RAISE EXCEPTION 'No session found with id % — replace v_session_id with a real session id (see the SELECT above).', v_session_id;
  END IF;

  FOR i IN 1..20 LOOP
    -- Stagger arrivals 8 seconds apart — player 1 has been waiting
    -- longest (~2.7 min ago), player 20 just joined (~8 sec ago).
    v_joined := now() - ((21 - i) * INTERVAL '8 seconds');

    INSERT INTO players (session_id, display_name, status, device_token, joined_at, last_active, is_active)
    VALUES (v_session_id, v_names[i], 'waiting', 'seed-token-' || i, v_joined, v_joined, true)
    RETURNING id INTO v_player_id;

    INSERT INTO player_statistics (
      player_id, session_id,
      games_played, wins, losses,
      current_win_streak, longest_win_streak, current_losing_streak,
      total_wait_secs, last_entered_queue, updated_at
    )
    VALUES (
      v_player_id, v_session_id,
      0, 0, 0,
      0, 0, 0,
      0, v_joined, now()
    );

    INSERT INTO queue_entries (session_id, player_id, status, entered_queue, priority_score)
    VALUES (v_session_id, v_player_id, 'waiting', v_joined, 0);
  END LOOP;

  -- Same functions the app calls after a real join — populates
  -- priority_score and position so the queue view is immediately correct.
  PERFORM recalculate_priority_scores(v_session_id);
  PERFORM recalculate_queue_positions(v_session_id);
END $$;

-- =============================================================
-- "VIEW AS PLAYER" HELPER
-- Run this to get each seeded player's id + device_token, so you
-- can open the player app as any of them without the real join
-- flow. See the browser console snippet below.
-- =============================================================
-- SELECT id AS player_id, display_name, device_token
-- FROM players
-- WHERE session_id = '00000000-0000-0000-0000-000000000000'
--   AND display_name = ANY(ARRAY[
--     'Jomar','Kim','Ana','Mark','Cherry','Rey','Liza','Jun','Grace','Paolo',
--     'Ivy','Noel','Rica','Boyet','Che','Ronnie','Tin','Dexter','Joy','Marlon'
--   ])
-- ORDER BY display_name;

-- =============================================================
-- CLEANUP (optional) — run this to remove just these test players
-- before re-seeding. Cascades to their queue_entries and
-- player_statistics automatically (ON DELETE CASCADE).
-- =============================================================
-- DELETE FROM players
-- WHERE session_id = '00000000-0000-0000-0000-000000000000'
--   AND display_name = ANY(ARRAY[
--     'Jomar','Kim','Ana','Mark','Cherry','Rey','Liza','Jun','Grace','Paolo',
--     'Ivy','Noel','Rica','Boyet','Che','Ronnie','Tin','Dexter','Joy','Marlon'
--   ]);
