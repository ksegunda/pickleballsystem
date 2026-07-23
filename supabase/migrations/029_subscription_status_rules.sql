-- =============================================================
-- Migration 029: Subscription status rules per plan type
-- "Expired" only makes sense for a plan with a real expiry date —
-- Monthly. Free is an ongoing rolling limit with no end date; Lifetime
-- has none by definition. Both are UI-restricted to Active/Cancelled
-- in AdminHostRow, but this CHECK constraint is the actual guarantee —
-- this table gets hand-edited via SQL sometimes (per its own original
-- migration comment), so the UI restriction alone wouldn't stop an
-- invalid combination entered that way.
--
-- Backfill first: any existing free/lifetime row already sitting at
-- 'expired' (shouldn't exist today, but this makes the migration safe
-- to run regardless) becomes 'active' — 'expired' was never a
-- meaningful state for those plan types in the first place.
-- =============================================================
UPDATE subscriptions
SET status = 'active'
WHERE status = 'expired' AND plan_type <> 'monthly';

ALTER TABLE subscriptions
  ADD CONSTRAINT chk_expired_only_for_monthly
  CHECK (status <> 'expired' OR plan_type = 'monthly');
