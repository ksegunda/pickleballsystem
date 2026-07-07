-- =============================================================
-- Migration 012: Match History View
-- Completed matches with court + full roster (JSON), for the
-- player-side "My Stats" match history list. Same JSON-aggregate
-- pattern as court_status_view / forecast_pool_view.
-- =============================================================
CREATE OR REPLACE VIEW match_history_view AS
SELECT
  m.id                                                        AS match_id,
  m.session_id,
  m.match_number,
  c.court_name,
  m.started_at,
  m.ended_at,
  m.winner_team,
  COALESCE(
    json_agg(
      json_build_object(
        'player_id',    mp.player_id,
        'display_name', pl.display_name,
        'team',         mp.team,
        'result',       mp.result
      ) ORDER BY mp.team, pl.display_name
    ) FILTER (WHERE mp.player_id IS NOT NULL),
    '[]'::json
  )                                                           AS players
FROM matches m
JOIN courts c          ON c.id = m.court_id
JOIN match_players mp  ON mp.match_id = m.id
JOIN players pl        ON pl.id = mp.player_id
WHERE m.status = 'completed'
GROUP BY m.id, m.session_id, m.match_number, c.court_name, m.started_at, m.ended_at, m.winner_team
ORDER BY m.ended_at DESC;
