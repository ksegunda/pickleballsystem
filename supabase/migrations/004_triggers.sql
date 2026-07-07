-- =============================================================
-- Migration 004: Triggers
-- =============================================================

-- =============================================================
-- TRIGGER: update_stats_after_match
-- Fires when a match transitions to 'completed'
-- Updates wins, losses, streaks for all players in the match
-- =============================================================
CREATE OR REPLACE FUNCTION fn_update_stats_after_match()
RETURNS TRIGGER AS $$
DECLARE
  v_player RECORD;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  FOR v_player IN
    SELECT mp.player_id, mp.team, mp.result
    FROM match_players mp
    WHERE mp.match_id = NEW.id
  LOOP
    INSERT INTO player_statistics (
      player_id, session_id, games_played, wins, losses,
      current_win_streak, longest_win_streak, current_losing_streak,
      last_played_at, updated_at
    )
    VALUES (
      v_player.player_id, NEW.session_id,
      1,
      CASE WHEN v_player.result = 'win'  THEN 1 ELSE 0 END,
      CASE WHEN v_player.result = 'loss' THEN 1 ELSE 0 END,
      CASE WHEN v_player.result = 'win'  THEN 1 ELSE 0 END,
      CASE WHEN v_player.result = 'win'  THEN 1 ELSE 0 END,
      CASE WHEN v_player.result = 'loss' THEN 1 ELSE 0 END,
      now(), now()
    )
    ON CONFLICT (player_id, session_id) DO UPDATE SET
      games_played = player_statistics.games_played + 1,
      wins = player_statistics.wins +
        CASE WHEN v_player.result = 'win'  THEN 1 ELSE 0 END,
      losses = player_statistics.losses +
        CASE WHEN v_player.result = 'loss' THEN 1 ELSE 0 END,
      current_win_streak = CASE
        WHEN v_player.result = 'win'
        THEN player_statistics.current_win_streak + 1
        ELSE 0
      END,
      longest_win_streak = GREATEST(
        player_statistics.longest_win_streak,
        CASE
          WHEN v_player.result = 'win'
          THEN player_statistics.current_win_streak + 1
          ELSE player_statistics.longest_win_streak
        END
      ),
      current_losing_streak = CASE
        WHEN v_player.result = 'loss'
        THEN player_statistics.current_losing_streak + 1
        ELSE 0
      END,
      last_played_at = now(),
      updated_at     = now();
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_stats_after_match
  AFTER UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_stats_after_match();

-- =============================================================
-- TRIGGER: update_history_after_match
-- Fires when a match completes — updates partner + opponent history
-- =============================================================
CREATE OR REPLACE FUNCTION fn_update_history_after_match()
RETURNS TRIGGER AS $$
DECLARE
  v_team_a  UUID[];
  v_team_b  UUID[];
  v_p1      UUID;
  v_p2      UUID;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(player_id) INTO v_team_a
  FROM match_players WHERE match_id = NEW.id AND team = 'team_a';

  SELECT array_agg(player_id) INTO v_team_b
  FROM match_players WHERE match_id = NEW.id AND team = 'team_b';

  -- Partner history (teammates)
  FOREACH v_p1 IN ARRAY COALESCE(v_team_a, '{}') LOOP
    FOREACH v_p2 IN ARRAY COALESCE(v_team_a, '{}') LOOP
      CONTINUE WHEN v_p1 = v_p2;
      INSERT INTO partner_history (session_id, player_id, partner_id, times_partnered, last_partnered)
      VALUES (NEW.session_id, v_p1, v_p2, 1, now())
      ON CONFLICT (session_id, player_id, partner_id)
      DO UPDATE SET
        times_partnered = partner_history.times_partnered + 1,
        last_partnered  = now();
    END LOOP;
  END LOOP;

  FOREACH v_p1 IN ARRAY COALESCE(v_team_b, '{}') LOOP
    FOREACH v_p2 IN ARRAY COALESCE(v_team_b, '{}') LOOP
      CONTINUE WHEN v_p1 = v_p2;
      INSERT INTO partner_history (session_id, player_id, partner_id, times_partnered, last_partnered)
      VALUES (NEW.session_id, v_p1, v_p2, 1, now())
      ON CONFLICT (session_id, player_id, partner_id)
      DO UPDATE SET
        times_partnered = partner_history.times_partnered + 1,
        last_partnered  = now();
    END LOOP;
  END LOOP;

  -- Opponent history (cross-team)
  FOREACH v_p1 IN ARRAY COALESCE(v_team_a, '{}') LOOP
    FOREACH v_p2 IN ARRAY COALESCE(v_team_b, '{}') LOOP
      INSERT INTO opponent_history (session_id, player_id, opponent_id, times_faced, last_faced)
      VALUES (NEW.session_id, v_p1, v_p2, 1, now())
      ON CONFLICT (session_id, player_id, opponent_id)
      DO UPDATE SET
        times_faced = opponent_history.times_faced + 1,
        last_faced  = now();

      INSERT INTO opponent_history (session_id, player_id, opponent_id, times_faced, last_faced)
      VALUES (NEW.session_id, v_p2, v_p1, 1, now())
      ON CONFLICT (session_id, player_id, opponent_id)
      DO UPDATE SET
        times_faced = opponent_history.times_faced + 1,
        last_faced  = now();
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_history_after_match
  AFTER UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_history_after_match();

-- =============================================================
-- TRIGGER: update_court_status_on_match
-- Keeps court.status in sync with match.status changes
-- =============================================================
CREATE OR REPLACE FUNCTION fn_sync_court_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status <> 'in_progress' THEN
    UPDATE courts SET status = 'occupied' WHERE id = NEW.court_id;
  ELSIF NEW.status IN ('completed', 'cancelled') AND OLD.status = 'in_progress' THEN
    UPDATE courts SET status = 'available' WHERE id = NEW.court_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_court_status
  AFTER UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_court_status();

-- =============================================================
-- TRIGGER: update_player_status_on_match
-- Sets player status to 'playing' when match starts,
-- back to 'waiting' (re-queued) when match completes
-- =============================================================
CREATE OR REPLACE FUNCTION fn_sync_player_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status <> 'in_progress' THEN
    UPDATE players p
    SET status = 'playing'
    WHERE p.id IN (
      SELECT player_id FROM match_players WHERE match_id = NEW.id
    );
  ELSIF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    UPDATE players p
    SET status = 'resting'
    WHERE p.id IN (
      SELECT player_id FROM match_players WHERE match_id = NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_player_status
  AFTER UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_player_status();

-- =============================================================
-- TRIGGER: auto_set_session_join_code
-- Generates a join code before session insert if not provided
-- =============================================================
CREATE OR REPLACE FUNCTION fn_auto_join_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.join_code IS NULL OR NEW.join_code = '' THEN
    NEW.join_code := generate_join_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_join_code
  BEFORE INSERT ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_join_code();
