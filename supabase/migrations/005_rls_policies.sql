-- =============================================================
-- Migration 005: Row Level Security Policies
-- =============================================================

-- =============================================================
-- hosts table
-- =============================================================
ALTER TABLE hosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hosts_read_own"
  ON hosts FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "hosts_insert_own"
  ON hosts FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "hosts_update_own"
  ON hosts FOR UPDATE
  USING (id = auth.uid());

-- =============================================================
-- sessions table
-- =============================================================
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Hosts manage their own sessions
CREATE POLICY "hosts_all_own_sessions"
  ON sessions FOR ALL
  USING (host_id = auth.uid());

-- Anyone can read active sessions (for player join)
CREATE POLICY "public_read_active_sessions"
  ON sessions FOR SELECT
  USING (status IN ('active', 'pending'));

-- =============================================================
-- session_settings table
-- =============================================================
ALTER TABLE session_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hosts_all_own_settings"
  ON session_settings FOR ALL
  USING (
    session_id IN (SELECT id FROM sessions WHERE host_id = auth.uid())
  );

-- Players can read settings for their session
CREATE POLICY "public_read_session_settings"
  ON session_settings FOR SELECT
  USING (
    session_id IN (SELECT id FROM sessions WHERE status IN ('active', 'pending'))
  );

-- =============================================================
-- courts table
-- =============================================================
ALTER TABLE courts ENABLE ROW LEVEL SECURITY;

-- Hosts manage courts for their sessions
CREATE POLICY "hosts_all_own_courts"
  ON courts FOR ALL
  USING (
    session_id IN (SELECT id FROM sessions WHERE host_id = auth.uid())
  );

-- Players can read courts in their session
CREATE POLICY "public_read_courts"
  ON courts FOR SELECT
  USING (
    session_id IN (SELECT id FROM sessions WHERE status IN ('active', 'pending'))
  );

-- =============================================================
-- players table
-- =============================================================
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- Hosts can read/manage players in their sessions
CREATE POLICY "hosts_all_session_players"
  ON players FOR ALL
  USING (
    session_id IN (SELECT id FROM sessions WHERE host_id = auth.uid())
  );

-- Players can read all players in active sessions (for leaderboard/queue)
CREATE POLICY "public_read_session_players"
  ON players FOR SELECT
  USING (
    session_id IN (SELECT id FROM sessions WHERE status IN ('active', 'pending'))
  );

-- Players can insert themselves (join session)
CREATE POLICY "public_insert_player"
  ON players FOR INSERT
  WITH CHECK (
    session_id IN (SELECT id FROM sessions WHERE status IN ('active', 'pending'))
  );

-- Players can update their own record via device_token
CREATE POLICY "players_update_own"
  ON players FOR UPDATE
  USING (device_token = current_setting('app.device_token', true));

-- =============================================================
-- queue_entries table
-- =============================================================
ALTER TABLE queue_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hosts_all_queue"
  ON queue_entries FOR ALL
  USING (
    session_id IN (SELECT id FROM sessions WHERE host_id = auth.uid())
  );

CREATE POLICY "public_read_queue"
  ON queue_entries FOR SELECT
  USING (
    session_id IN (SELECT id FROM sessions WHERE status IN ('active', 'pending'))
  );

CREATE POLICY "public_insert_queue"
  ON queue_entries FOR INSERT
  WITH CHECK (
    session_id IN (SELECT id FROM sessions WHERE status IN ('active', 'pending'))
  );

-- =============================================================
-- matches table
-- =============================================================
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hosts_all_matches"
  ON matches FOR ALL
  USING (
    session_id IN (SELECT id FROM sessions WHERE host_id = auth.uid())
  );

CREATE POLICY "public_read_matches"
  ON matches FOR SELECT
  USING (
    session_id IN (SELECT id FROM sessions WHERE status IN ('active', 'pending'))
  );

-- =============================================================
-- match_players table
-- =============================================================
ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hosts_all_match_players"
  ON match_players FOR ALL
  USING (
    match_id IN (
      SELECT m.id FROM matches m
      JOIN sessions s ON s.id = m.session_id
      WHERE s.host_id = auth.uid()
    )
  );

CREATE POLICY "public_read_match_players"
  ON match_players FOR SELECT
  USING (
    match_id IN (
      SELECT m.id FROM matches m
      JOIN sessions s ON s.id = m.session_id
      WHERE s.status IN ('active', 'pending')
    )
  );

-- =============================================================
-- player_statistics table
-- =============================================================
ALTER TABLE player_statistics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hosts_all_stats"
  ON player_statistics FOR ALL
  USING (
    session_id IN (SELECT id FROM sessions WHERE host_id = auth.uid())
  );

CREATE POLICY "public_read_stats"
  ON player_statistics FOR SELECT
  USING (
    session_id IN (SELECT id FROM sessions WHERE status IN ('active', 'pending'))
  );

-- =============================================================
-- partner_history / opponent_history tables
-- =============================================================
ALTER TABLE partner_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hosts_all_partner_history"
  ON partner_history FOR ALL
  USING (
    session_id IN (SELECT id FROM sessions WHERE host_id = auth.uid())
  );

CREATE POLICY "public_read_partner_history"
  ON partner_history FOR SELECT
  USING (
    session_id IN (SELECT id FROM sessions WHERE status IN ('active', 'pending'))
  );

ALTER TABLE opponent_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hosts_all_opponent_history"
  ON opponent_history FOR ALL
  USING (
    session_id IN (SELECT id FROM sessions WHERE host_id = auth.uid())
  );

CREATE POLICY "public_read_opponent_history"
  ON opponent_history FOR SELECT
  USING (
    session_id IN (SELECT id FROM sessions WHERE status IN ('active', 'pending'))
  );

-- =============================================================
-- reports table
-- =============================================================
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hosts_all_reports"
  ON reports FOR ALL
  USING (
    session_id IN (SELECT id FROM sessions WHERE host_id = auth.uid())
  );
