-- =============================================================
-- Migration 018: Device token uniqueness
-- Closes a real race in the optimistic join flow: two concurrent
-- join attempts for the same device (two open tabs, a retried
-- request racing the original) could both pass the JS-side
-- findByDeviceToken check before either INSERT commits, creating
-- two player rows for the same device. Same partial-unique pattern
-- already used for queue_entries (idx_queue_unique_active,
-- migration 001) — unique only among currently-active players, so
-- a soft-removed (is_active=false) player never blocks a device
-- that later rejoins.
-- =============================================================
CREATE UNIQUE INDEX idx_players_device_token_unique
  ON players(session_id, device_token)
  WHERE is_active = true;
