-- =============================================================
-- Migration 009: Realtime Publication
-- Adds the tables the host/player dashboards subscribe to
-- (postgres_changes) to the "supabase_realtime" publication.
-- Without this, Postgres never broadcasts their row changes,
-- no matter how correct the frontend .channel()/.on() code is.
-- Safe to re-run: skips any table already in the publication.
-- =============================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'players',
    'queue_entries',
    'matches',
    'match_players',
    'courts',
    'player_statistics',
    'sessions'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      RAISE NOTICE 'Added % to supabase_realtime', tbl;
    ELSE
      RAISE NOTICE '% already in supabase_realtime, skipped', tbl;
    END IF;
  END LOOP;
END $$;

-- =============================================================
-- Reference queries (run manually in the SQL Editor as needed —
-- not part of the migration's effect):
--
-- Confirm every required table is now enabled for realtime:
--
--   SELECT tablename,
--          CASE WHEN tablename IN (
--            SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
--          ) THEN 'enabled' ELSE 'missing' END AS realtime_status
--   FROM (VALUES
--     ('players'), ('queue_entries'), ('matches'),
--     ('match_players'), ('courts'), ('player_statistics'), ('sessions')
--   ) AS t(tablename)
--   ORDER BY tablename;
--
-- Inspect RLS policies on the same tables (a SELECT policy that
-- excludes a row for a given client's role means that client's
-- realtime socket never receives that row's change event either):
--
--   SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('players','queue_entries','matches','match_players','courts','player_statistics','sessions')
--   ORDER BY tablename, policyname;
-- =============================================================
