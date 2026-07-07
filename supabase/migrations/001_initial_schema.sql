-- =============================================================
-- OpenPlay Pickleball Queue Management System
-- Migration 001: Initial Schema
-- =============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- ENUMERATIONS
-- =============================================================

CREATE TYPE session_status AS ENUM (
  'pending', 'active', 'paused', 'ended', 'archived'
);

CREATE TYPE player_status AS ENUM (
  'waiting', 'playing', 'resting', 'offline'
);

CREATE TYPE court_status AS ENUM (
  'available', 'occupied', 'maintenance'
);

CREATE TYPE match_status AS ENUM (
  'pending', 'in_progress', 'completed', 'cancelled'
);

CREATE TYPE team_side AS ENUM ('team_a', 'team_b');
CREATE TYPE match_result AS ENUM ('win', 'loss');
CREATE TYPE queue_entry_status AS ENUM ('waiting', 'matched', 'removed');

-- =============================================================
-- TABLE: hosts
-- =============================================================
CREATE TABLE hosts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  club_name     TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- TABLE: sessions
-- =============================================================
CREATE TABLE sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id           UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  club_name         TEXT NOT NULL,
  session_name      TEXT NOT NULL,
  session_date      DATE NOT NULL,
  start_time        TIME NOT NULL,
  end_time          TIME,
  number_of_courts  SMALLINT NOT NULL CHECK (number_of_courts BETWEEN 1 AND 20),
  max_players       SMALLINT CHECK (max_players IS NULL OR max_players > 0),
  status            session_status NOT NULL DEFAULT 'pending',
  join_code         CHAR(6) NOT NULL UNIQUE,
  qr_code_data      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  CONSTRAINT valid_times CHECK (end_time IS NULL OR end_time > start_time)
);

CREATE INDEX idx_sessions_host_id   ON sessions(host_id);
CREATE INDEX idx_sessions_join_code ON sessions(join_code);
CREATE INDEX idx_sessions_status    ON sessions(status);

-- =============================================================
-- TABLE: session_settings
-- =============================================================
CREATE TABLE session_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  theme                 TEXT NOT NULL DEFAULT 'light',
  dark_mode             BOOLEAN NOT NULL DEFAULT false,
  language              TEXT NOT NULL DEFAULT 'en',
  allow_late_join       BOOLEAN NOT NULL DEFAULT true,
  games_to_win          SMALLINT NOT NULL DEFAULT 11,
  match_format          TEXT NOT NULL DEFAULT 'doubles',
  weight_waiting_time   DECIMAL(3,2) NOT NULL DEFAULT 0.40,
  weight_games_played   DECIMAL(3,2) NOT NULL DEFAULT 0.35,
  weight_performance    DECIMAL(3,2) NOT NULL DEFAULT 0.25,
  anti_repeat_threshold SMALLINT NOT NULL DEFAULT 3,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT weights_sum CHECK (
    ABS((weight_waiting_time + weight_games_played + weight_performance) - 1.0) < 0.01
  )
);

-- =============================================================
-- TABLE: courts
-- =============================================================
CREATE TABLE courts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  court_number  SMALLINT NOT NULL,
  court_name    TEXT NOT NULL,
  status        court_status NOT NULL DEFAULT 'available',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, court_number)
);

CREATE INDEX idx_courts_session_id ON courts(session_id);
CREATE INDEX idx_courts_status     ON courts(status);

-- =============================================================
-- TABLE: players
-- =============================================================
CREATE TABLE players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  status        player_status NOT NULL DEFAULT 'waiting',
  device_token  TEXT,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active   TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT unique_name_per_session UNIQUE (session_id, display_name)
);

CREATE INDEX idx_players_session_id   ON players(session_id);
CREATE INDEX idx_players_device_token ON players(device_token);
CREATE INDEX idx_players_status       ON players(status);

-- =============================================================
-- TABLE: queue_entries
-- =============================================================
CREATE TABLE queue_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  position        SMALLINT,
  priority_score  DECIMAL(10,4) NOT NULL DEFAULT 0,
  entered_queue   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          queue_entry_status NOT NULL DEFAULT 'waiting'
);

CREATE INDEX idx_queue_session_id ON queue_entries(session_id);
CREATE INDEX idx_queue_priority   ON queue_entries(session_id, priority_score DESC);
CREATE INDEX idx_queue_status     ON queue_entries(status);
-- One active queue entry per player per session
CREATE UNIQUE INDEX idx_queue_unique_active
  ON queue_entries(session_id, player_id)
  WHERE status = 'waiting';

-- =============================================================
-- TABLE: matches
-- =============================================================
CREATE TABLE matches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  court_id      UUID NOT NULL REFERENCES courts(id),
  match_number  SMALLINT NOT NULL,
  status        match_status NOT NULL DEFAULT 'pending',
  winner_team   team_side,
  started_at    TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, match_number)
);

CREATE INDEX idx_matches_session_id ON matches(session_id);
CREATE INDEX idx_matches_court_id   ON matches(court_id);
CREATE INDEX idx_matches_status     ON matches(status);

-- =============================================================
-- TABLE: match_players
-- =============================================================
CREATE TABLE match_players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team        team_side NOT NULL,
  result      match_result,
  UNIQUE(match_id, player_id)
);

CREATE INDEX idx_match_players_match_id  ON match_players(match_id);
CREATE INDEX idx_match_players_player_id ON match_players(player_id);

-- =============================================================
-- TABLE: player_statistics
-- =============================================================
CREATE TABLE player_statistics (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id             UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  session_id            UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  games_played          INTEGER NOT NULL DEFAULT 0,
  wins                  INTEGER NOT NULL DEFAULT 0,
  losses                INTEGER NOT NULL DEFAULT 0,
  current_win_streak    SMALLINT NOT NULL DEFAULT 0,
  longest_win_streak    SMALLINT NOT NULL DEFAULT 0,
  current_losing_streak SMALLINT NOT NULL DEFAULT 0,
  total_wait_secs       INTEGER NOT NULL DEFAULT 0,
  last_played_at        TIMESTAMPTZ,
  last_entered_queue    TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id, session_id),
  CONSTRAINT non_negative_stats CHECK (
    games_played >= 0 AND wins >= 0 AND losses >= 0
  ),
  CONSTRAINT wins_losses_sum CHECK (
    wins + losses <= games_played
  )
);

CREATE INDEX idx_player_stats_session ON player_statistics(session_id);
CREATE INDEX idx_player_stats_wins    ON player_statistics(session_id, wins DESC);

-- =============================================================
-- TABLE: partner_history
-- =============================================================
CREATE TABLE partner_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id         UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  partner_id        UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  times_partnered   SMALLINT NOT NULL DEFAULT 1,
  last_partnered    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, player_id, partner_id),
  CHECK (player_id <> partner_id)
);

CREATE INDEX idx_partner_history_player ON partner_history(session_id, player_id);

-- =============================================================
-- TABLE: opponent_history
-- =============================================================
CREATE TABLE opponent_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  opponent_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  times_faced     SMALLINT NOT NULL DEFAULT 1,
  last_faced      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, player_id, opponent_id),
  CHECK (player_id <> opponent_id)
);

CREATE INDEX idx_opponent_history_player ON opponent_history(session_id, player_id);

-- =============================================================
-- TABLE: reports
-- =============================================================
CREATE TABLE reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  data          JSONB NOT NULL,
  pdf_url       TEXT,
  excel_url     TEXT
);

CREATE INDEX idx_reports_session_id ON reports(session_id);
