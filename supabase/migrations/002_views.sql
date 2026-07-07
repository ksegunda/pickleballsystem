-- =============================================================
-- Migration 002: Database Views
-- =============================================================

-- =============================================================
-- VIEW: queue_with_stats
-- Full queue with computed player statistics for the algorithm
-- =============================================================
CREATE OR REPLACE VIEW queue_with_stats AS
SELECT
  q.id                                                        AS queue_id,
  q.session_id,
  q.player_id,
  q.position,
  q.priority_score,
  q.entered_queue,
  q.status                                                    AS queue_status,
  p.display_name,
  p.status                                                    AS player_status,
  COALESCE(s.games_played, 0)                                 AS games_played,
  COALESCE(s.wins, 0)                                         AS wins,
  COALESCE(s.losses, 0)                                       AS losses,
  CASE
    WHEN COALESCE(s.games_played, 0) = 0 THEN 0
    ELSE ROUND(s.wins::DECIMAL / s.games_played * 100, 1)
  END                                                         AS win_rate,
  COALESCE(s.current_win_streak, 0)                           AS current_win_streak,
  COALESCE(s.longest_win_streak, 0)                           AS longest_win_streak,
  COALESCE(s.current_losing_streak, 0)                        AS current_losing_streak,
  EXTRACT(EPOCH FROM (now() - q.entered_queue))::INTEGER      AS waiting_secs
FROM queue_entries q
JOIN players p   ON p.id = q.player_id
LEFT JOIN player_statistics s
  ON s.player_id = q.player_id AND s.session_id = q.session_id
WHERE q.status = 'waiting';

-- =============================================================
-- VIEW: leaderboard_view
-- Ranked players by wins, then win rate, then games played
-- =============================================================
CREATE OR REPLACE VIEW leaderboard_view AS
SELECT
  p.id                                                        AS player_id,
  p.session_id,
  p.display_name,
  p.status                                                    AS player_status,
  COALESCE(s.games_played, 0)                                 AS games_played,
  COALESCE(s.wins, 0)                                         AS wins,
  COALESCE(s.losses, 0)                                       AS losses,
  CASE
    WHEN COALESCE(s.games_played, 0) = 0 THEN 0.0
    ELSE ROUND(s.wins::DECIMAL / s.games_played * 100, 1)
  END                                                         AS win_rate,
  COALESCE(s.current_win_streak, 0)                           AS current_win_streak,
  COALESCE(s.longest_win_streak, 0)                           AS longest_win_streak,
  COALESCE(s.current_losing_streak, 0)                        AS current_losing_streak,
  s.last_played_at,
  RANK() OVER (
    PARTITION BY p.session_id
    ORDER BY
      COALESCE(s.wins, 0) DESC,
      CASE WHEN COALESCE(s.games_played, 0) = 0 THEN 0
           ELSE s.wins::DECIMAL / s.games_played END DESC,
      COALESCE(s.games_played, 0) DESC
  )                                                           AS rank
FROM players p
LEFT JOIN player_statistics s
  ON s.player_id = p.id AND s.session_id = p.session_id
WHERE p.is_active = true;

-- =============================================================
-- VIEW: court_status_view
-- Courts with their current match and players in JSON
-- =============================================================
CREATE OR REPLACE VIEW court_status_view AS
SELECT
  c.id                                                        AS court_id,
  c.session_id,
  c.court_name,
  c.court_number,
  c.status                                                    AS court_status,
  m.id                                                        AS match_id,
  m.match_number,
  m.status                                                    AS match_status,
  m.started_at,
  m.winner_team,
  CASE
    WHEN m.started_at IS NOT NULL AND m.ended_at IS NULL
    THEN EXTRACT(EPOCH FROM (now() - m.started_at))::INTEGER
    ELSE NULL
  END                                                         AS elapsed_secs,
  COALESCE(
    json_agg(
      json_build_object(
        'player_id',    mp.player_id,
        'display_name', pl.display_name,
        'team',         mp.team
      ) ORDER BY mp.team, pl.display_name
    ) FILTER (WHERE mp.player_id IS NOT NULL),
    '[]'::json
  )                                                           AS players
FROM courts c
LEFT JOIN matches m
  ON m.court_id = c.id
  AND m.status IN ('pending', 'in_progress')
LEFT JOIN match_players mp ON mp.match_id = m.id
LEFT JOIN players pl       ON pl.id = mp.player_id
GROUP BY
  c.id, c.session_id, c.court_name, c.court_number, c.status,
  m.id, m.match_number, m.status, m.started_at, m.winner_team;

-- =============================================================
-- VIEW: session_summary_view
-- Aggregated session statistics for dashboard overview
-- =============================================================
CREATE OR REPLACE VIEW session_summary_view AS
SELECT
  s.id                                                        AS session_id,
  s.session_name,
  s.club_name,
  s.status,
  s.session_date,
  s.started_at,
  s.join_code,
  s.number_of_courts,
  COUNT(DISTINCT p.id) FILTER (WHERE p.is_active = true)      AS total_players,
  COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'waiting')    AS players_waiting,
  COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'playing')    AS players_playing,
  COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'completed')  AS matches_completed,
  COUNT(DISTINCT m.id) FILTER (WHERE m.status = 'in_progress') AS matches_in_progress,
  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'available')  AS courts_available,
  AVG(
    CASE WHEN m.status = 'completed' AND m.started_at IS NOT NULL AND m.ended_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (m.ended_at - m.started_at))::INTEGER
    END
  )::INTEGER                                                   AS avg_match_duration_secs
FROM sessions s
LEFT JOIN players p  ON p.session_id = s.id
LEFT JOIN matches m  ON m.session_id = s.id
LEFT JOIN courts c   ON c.session_id = s.id
GROUP BY s.id, s.session_name, s.club_name, s.status,
         s.session_date, s.started_at, s.join_code, s.number_of_courts;
