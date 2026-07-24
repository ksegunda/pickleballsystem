-- =============================================================
-- Migration 041: Public club-branding view
-- Player-facing pages (Leaderboard, Join/QR) need to show the host's
-- uploaded club logo — but `hosts` itself has no public SELECT policy
-- (RLS is strictly id = auth.uid(), and rightly so: it also carries
-- `email`). A narrow view sidesteps this cleanly rather than loosening
-- `hosts`' RLS: views in this schema aren't declared security_invoker,
-- so they run with the defining role's privileges regardless of the
-- querying role's RLS — and since this view only ever selects
-- club_name (already public via `sessions`) and avatar_url, nothing
-- sensitive is exposed even though it's readable by anon/authenticated
-- like every other public_read_* view in this schema.
-- =============================================================
CREATE OR REPLACE VIEW session_branding_view AS
SELECT
  s.id           AS session_id,
  s.club_name,
  h.avatar_url   AS host_avatar_url
FROM sessions s
JOIN hosts h ON h.id = s.host_id;
