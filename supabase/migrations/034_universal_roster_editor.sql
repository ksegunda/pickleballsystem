-- =============================================================
-- Migration 034: Universal roster editor
-- One primitive — move_player — replaces update_match_teams (which
-- only ever rearranged already-seated players within one forecasted/
-- pending match) with something that can place a player into or out
-- of ANY editable location: the fair queue, any existing forecasted
-- Set, or any pending/in_progress Court. This is what lets a host
-- pull a player off a LIVE court mid-match and send them to the
-- queue or another set — something update_match_teams's
-- status IN ('forecasted','pending') gate never allowed — and lets
-- Next Up sets take players from anywhere instead of only reshuffling
-- who's already in them.
--
-- Deliberately does real DELETE/INSERT on match_players (not a
-- separate "assignment" table) so finish_match's live
-- SELECT ... FROM match_players at declaration time (migration 016)
-- — and the stats/history triggers that fire off the same table
-- right after — automatically reflect whoever was actually swapped
-- in, with no extra code needed on that side.
--
-- Only capacity is enforced (a team can't exceed 2 seats in doubles,
-- 1 in singles) — NOT balance. A host can leave a live match at 2v1
-- on purpose (e.g. an injury) rather than being forced to find an
-- immediate substitute.
-- =============================================================

DROP FUNCTION IF EXISTS update_match_teams(UUID, UUID[], UUID[]);

CREATE OR REPLACE FUNCTION move_player(
  p_player_id      UUID,
  p_dest_match_id  UUID,       -- NULL = back to the fair queue
  p_dest_team      team_side   -- required whenever p_dest_match_id is not NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_session_id       UUID;
  v_source_match_id  UUID;
  v_dest_status       match_status;
  v_dest_session      UUID;
  v_team_cap          SMALLINT;
  v_seated_on_team    INTEGER;
BEGIN
  IF p_dest_match_id IS NOT NULL AND p_dest_team IS NULL THEN
    RETURN false;
  END IF;

  SELECT session_id INTO v_session_id
  FROM players WHERE id = p_player_id AND is_active = true;

  IF v_session_id IS NULL THEN
    RETURN false;
  END IF;

  -- Locate + vacate wherever the player currently is. Seated in a
  -- still-editable match takes priority over a queue row — a player
  -- can't be both at once (generate_match/forecast_next_sets already
  -- flip their queue_entries to 'matched' the moment they're seated).
  SELECT mp.match_id INTO v_source_match_id
  FROM match_players mp
  JOIN matches m ON m.id = mp.match_id
  WHERE mp.player_id = p_player_id AND m.status IN ('forecasted', 'pending', 'in_progress')
  FOR UPDATE OF m;

  IF v_source_match_id IS NOT NULL THEN
    DELETE FROM match_players WHERE match_id = v_source_match_id AND player_id = p_player_id;
  ELSE
    PERFORM 1 FROM queue_entries
    WHERE player_id = p_player_id AND session_id = v_session_id AND status = 'waiting'
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN false; -- not currently in an editable location (resting/offline/gone)
    END IF;
  END IF;

  IF p_dest_match_id IS NULL THEN
    UPDATE queue_entries SET status = 'removed'
    WHERE player_id = p_player_id AND status = 'waiting';

    INSERT INTO queue_entries (session_id, player_id, status, entered_queue)
    VALUES (v_session_id, p_player_id, 'waiting', now());

    UPDATE players SET status = 'waiting', last_active = now() WHERE id = p_player_id;
  ELSE
    SELECT status, session_id INTO v_dest_status, v_dest_session
    FROM matches WHERE id = p_dest_match_id
    FOR UPDATE;

    IF v_dest_session IS DISTINCT FROM v_session_id OR v_dest_status NOT IN ('forecasted', 'pending', 'in_progress') THEN
      RETURN false; -- wrong session, or that set/court is no longer editable
    END IF;

    SELECT CASE WHEN match_format = 'singles' THEN 1 ELSE 2 END
    INTO v_team_cap
    FROM session_settings WHERE session_id = v_session_id;

    SELECT COUNT(*) INTO v_seated_on_team
    FROM match_players WHERE match_id = p_dest_match_id AND team = p_dest_team;

    IF v_seated_on_team >= v_team_cap THEN
      RETURN false; -- that side is already full
    END IF;

    INSERT INTO match_players (match_id, player_id, team) VALUES (p_dest_match_id, p_player_id, p_dest_team);

    -- Only relevant if they came from the queue — a Set-to-Set or
    -- Set-to-Court move never touched queue_entries in the first place.
    UPDATE queue_entries SET status = 'matched'
    WHERE player_id = p_player_id AND session_id = v_session_id AND status = 'waiting';

    UPDATE players
    SET status = CASE WHEN v_dest_status = 'in_progress' THEN 'playing' ELSE 'waiting' END,
        last_active = now()
    WHERE id = p_player_id;
  END IF;

  -- If that leaves the source match with nobody in it, there's
  -- nothing left to show — an empty forecasted/pending set is
  -- deleted outright (never played, no history to preserve); an
  -- emptied in_progress match is cancelled instead of deleted,
  -- since it has real elapsed time. Either way, trg_sync_court_status
  -- picks up the 'cancelled' transition on its own and frees the
  -- court — no need to touch courts directly here.
  IF v_source_match_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM match_players WHERE match_id = v_source_match_id)
  THEN
    UPDATE matches SET status = 'cancelled', ended_at = now()
    WHERE id = v_source_match_id AND status = 'in_progress';

    DELETE FROM matches WHERE id = v_source_match_id AND status IN ('forecasted', 'pending');
  END IF;

  PERFORM recalculate_priority_scores(v_session_id);
  PERFORM recalculate_queue_positions(v_session_id);

  RETURN true;
END;
$$ LANGUAGE plpgsql;
