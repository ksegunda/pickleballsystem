-- =============================================================
-- Migration 020: Player Level
-- Replaces the host-configurable Fairness Algorithm Weights step
-- (Wait Time / Games Played / Performance sliders) and the unused
-- Dark Mode toggle with a single "Player Level" category the host
-- picks for the whole session, shown to players before they join
-- so they know what kind of game to expect.
--
-- The weight_* columns and the fairness algorithm itself are
-- untouched — recalculate_priority_scores/forecast_next_sets still
-- read them per session exactly as before. Only the input path
-- changes: the host no longer sets them through the UI, the
-- service layer now always writes the existing defaults
-- (0.40 / 0.35 / 0.25). dark_mode is similarly left in place,
-- unused (confirmed no read-side consumer anywhere in the app),
-- just no longer collected from the host.
-- =============================================================

CREATE TYPE player_level AS ENUM ('all_levels', 'beginner', 'intermediate', 'advanced');

ALTER TABLE session_settings
  ADD COLUMN player_level player_level NOT NULL DEFAULT 'all_levels';
