-- =============================================================
-- Migration 003: Database Functions
-- =============================================================

-- =============================================================
-- FUNCTION: generate_join_code
-- Generates a unique 6-character alphanumeric join code
-- =============================================================
CREATE OR REPLACE FUNCTION generate_join_code()
RETURNS CHAR(6) AS $$
DECLARE
  v_code    CHAR(6);
  v_exists  BOOLEAN;
  v_chars   TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_len     INTEGER := length(v_chars);
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, floor(random() * v_len + 1)::INTEGER, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM sessions WHERE join_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- =============================================================
-- FUNCTION: calculate_priority_score
-- Computes a player's queue priority score
-- Higher score = higher priority for match selection
-- =============================================================
CREATE OR REPLACE FUNCTION calculate_priority_score(
  p_player_id   UUID,
  p_session_id  UUID
)
RETURNS DECIMAL(10,4) AS $$
DECLARE
  v_stats           player_statistics%ROWTYPE;
  v_settings        session_settings%ROWTYPE;
  v_queue           queue_entries%ROWTYPE;
  v_waiting_secs    INTEGER;
  v_max_wait        INTEGER;
  v_max_games       INTEGER;
  v_session_avg_wr  DECIMAL;
  v_norm_wait       DECIMAL := 0;
  v_norm_games      DECIMAL := 0;
  v_perf_balance    DECIMAL := 0;
  v_score           DECIMAL(10,4);
BEGIN
  -- Fetch settings
  SELECT * INTO v_settings FROM session_settings WHERE session_id = p_session_id;

  -- Fetch player stats (may not exist yet)
  SELECT * INTO v_stats
  FROM player_statistics
  WHERE player_id = p_player_id AND session_id = p_session_id;

  -- Fetch queue entry
  SELECT * INTO v_queue
  FROM queue_entries
  WHERE player_id = p_player_id AND session_id = p_session_id AND status = 'waiting';

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_waiting_secs := EXTRACT(EPOCH FROM (now() - v_queue.entered_queue))::INTEGER;

  -- Get session-wide maximums for normalization
  SELECT
    MAX(EXTRACT(EPOCH FROM (now() - qe.entered_queue))::INTEGER),
    MAX(COALESCE(ps.games_played, 0))
  INTO v_max_wait, v_max_games
  FROM queue_entries qe
  LEFT JOIN player_statistics ps
    ON ps.player_id = qe.player_id AND ps.session_id = qe.session_id
  WHERE qe.session_id = p_session_id AND qe.status = 'waiting';

  -- Normalize waiting time [0,1]
  IF v_max_wait > 0 THEN
    v_norm_wait := v_waiting_secs::DECIMAL / v_max_wait;
  END IF;

  -- Normalize games played (inverted: fewer games = higher score)
  IF v_max_games > 0 THEN
    v_norm_games := 1.0 - (COALESCE(v_stats.games_played, 0)::DECIMAL / v_max_games);
  ELSE
    v_norm_games := 1.0;
  END IF;

  -- Performance balance: penalize outliers (too high or too low win rate vs session avg)
  SELECT AVG(
    CASE WHEN ps2.games_played = 0 THEN 0.5
         ELSE ps2.wins::DECIMAL / ps2.games_played END
  ) INTO v_session_avg_wr
  FROM player_statistics ps2
  WHERE ps2.session_id = p_session_id;

  DECLARE
    v_player_wr DECIMAL := CASE
      WHEN COALESCE(v_stats.games_played, 0) = 0 THEN 0.5
      ELSE v_stats.wins::DECIMAL / v_stats.games_played
    END;
  BEGIN
    -- Reward players closer to session average (balanced competition)
    v_perf_balance := 1.0 - ABS(v_player_wr - COALESCE(v_session_avg_wr, 0.5));
  END;

  -- Weighted composite score
  v_score := (
    v_settings.weight_waiting_time * v_norm_wait +
    v_settings.weight_games_played * v_norm_games +
    v_settings.weight_performance  * v_perf_balance
  );

  RETURN ROUND(v_score, 4);
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================
-- FUNCTION: recalculate_queue_positions
-- Updates position column for all waiting players in a session
-- =============================================================
CREATE OR REPLACE FUNCTION recalculate_queue_positions(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE queue_entries qe
  SET position = ranked.rn
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        ORDER BY priority_score DESC, entered_queue ASC
      ) AS rn
    FROM queue_entries
    WHERE session_id = p_session_id AND status = 'waiting'
  ) ranked
  WHERE qe.id = ranked.id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- FUNCTION: get_session_fairness_score
-- Returns a 0-100 fairness score measuring session equity
-- =============================================================
CREATE OR REPLACE FUNCTION get_session_fairness_score(p_session_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_avg_wait          DECIMAL;
  v_max_wait          DECIMAL;
  v_min_wait          DECIMAL;
  v_stddev_games      DECIMAL;
  v_avg_games         DECIMAL;
  v_repeated_partner  DECIMAL;
  v_total_partners    INTEGER;
  v_repeated_partners INTEGER;
  v_fairness_score    DECIMAL;
  v_result            JSONB;
BEGIN
  -- Average waiting time
  SELECT
    AVG(total_wait_secs),
    MAX(total_wait_secs),
    MIN(total_wait_secs),
    STDDEV(games_played),
    AVG(games_played)
  INTO v_avg_wait, v_max_wait, v_min_wait, v_stddev_games, v_avg_games
  FROM player_statistics
  WHERE session_id = p_session_id;

  -- Repeated partner percentage
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE times_partnered > 1)
  INTO v_total_partners, v_repeated_partners
  FROM partner_history
  WHERE session_id = p_session_id;

  IF v_total_partners > 0 THEN
    v_repeated_partner := v_repeated_partners::DECIMAL / v_total_partners * 100;
  ELSE
    v_repeated_partner := 0;
  END IF;

  -- Fairness score: penalize high variance in games played and wait times
  DECLARE
    v_games_equity DECIMAL := CASE
      WHEN COALESCE(v_avg_games, 0) = 0 THEN 100
      ELSE GREATEST(0, 100 - (COALESCE(v_stddev_games, 0) / COALESCE(v_avg_games, 1) * 100))
    END;
    v_wait_equity DECIMAL := CASE
      WHEN COALESCE(v_max_wait, 0) = 0 THEN 100
      ELSE GREATEST(0, 100 - ((COALESCE(v_max_wait, 0) - COALESCE(v_min_wait, 0)) / COALESCE(v_max_wait, 1) * 50))
    END;
    v_repeat_equity DECIMAL := GREATEST(0, 100 - v_repeated_partner);
  BEGIN
    v_fairness_score := ROUND((v_games_equity * 0.4 + v_wait_equity * 0.35 + v_repeat_equity * 0.25), 1);
  END;

  v_result := jsonb_build_object(
    'fairness_score',         v_fairness_score,
    'avg_wait_secs',          COALESCE(v_avg_wait, 0)::INTEGER,
    'max_wait_secs',          COALESCE(v_max_wait, 0)::INTEGER,
    'min_wait_secs',          COALESCE(v_min_wait, 0)::INTEGER,
    'avg_games_played',       ROUND(COALESCE(v_avg_games, 0), 1),
    'games_stddev',           ROUND(COALESCE(v_stddev_games, 0), 2),
    'repeated_partner_pct',   ROUND(v_repeated_partner, 1),
    'total_partner_pairs',    v_total_partners
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================
-- FUNCTION: create_session_courts
-- Auto-creates court records when a session starts
-- =============================================================
CREATE OR REPLACE FUNCTION create_session_courts(
  p_session_id      UUID,
  p_num_courts      SMALLINT
)
RETURNS VOID AS $$
DECLARE
  i INTEGER;
BEGIN
  FOR i IN 1..p_num_courts LOOP
    INSERT INTO courts (session_id, court_number, court_name)
    VALUES (p_session_id, i, 'Court ' || i)
    ON CONFLICT (session_id, court_number) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- FUNCTION: get_next_match_number
-- Returns the next sequential match number for a session
-- =============================================================
CREATE OR REPLACE FUNCTION get_next_match_number(p_session_id UUID)
RETURNS SMALLINT AS $$
DECLARE
  v_next SMALLINT;
BEGIN
  SELECT COALESCE(MAX(match_number), 0) + 1
  INTO v_next
  FROM matches
  WHERE session_id = p_session_id;
  RETURN v_next;
END;
$$ LANGUAGE plpgsql;
