-- =============================================================
-- Migration 031: Leaderboard ranks must be strictly unique
-- RANK() deliberately shares a number across tied rows (e.g. two
-- players tied at the top both show rank 1) — that's standard SQL
-- ranking semantics, but not what "Top 1, Top 2, Top 3" is supposed
-- to mean here. ROW_NUMBER() never repeats a value regardless of
-- ties. Added p.id as a final tiebreaker so a genuine full tie still
-- resolves the same way on every query instead of varying run to run.
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
  ROW_NUMBER() OVER (
    PARTITION BY p.session_id
    ORDER BY
      COALESCE(s.wins, 0) DESC,
      CASE WHEN COALESCE(s.games_played, 0) = 0 THEN 0
           ELSE s.wins::DECIMAL / s.games_played END DESC,
      COALESCE(s.games_played, 0) DESC,
      p.id ASC
  )                                                           AS rank
FROM players p
LEFT JOIN player_statistics s
  ON s.player_id = p.id AND s.session_id = p.session_id
WHERE p.is_active = true;
