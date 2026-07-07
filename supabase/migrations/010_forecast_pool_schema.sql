-- =============================================================
-- Migration 010: Forecast Pool — Schema
-- A "forecasted" match is a fully-paired set that hasn't been
-- assigned to a court yet (it's sitting in the shared Next Up
-- pool). It needs a court_id-less state, which the current
-- schema doesn't allow.
--
-- The new enum value must be committed before anything can
-- reference it (Postgres forbids using an enum value added by
-- ALTER TYPE ... ADD VALUE inside the same transaction it was
-- added in) — that's why this is its own migration file, applied
-- before 011.
-- =============================================================

ALTER TABLE matches ALTER COLUMN court_id DROP NOT NULL;

ALTER TYPE match_status ADD VALUE 'forecasted';
