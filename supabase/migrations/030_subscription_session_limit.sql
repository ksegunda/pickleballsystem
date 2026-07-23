-- =============================================================
-- Migration 030: Per-host configurable Free plan session limit
-- Replaces the hardcoded FREE_TIER_MONTHLY_SESSION_LIMIT constant —
-- the super admin now sets this per host, not one fixed number for
-- everyone. Only ever consulted for a free-plan host, or a paid plan
-- that's fallen back to free-tier behavior (expired) — an active
-- Monthly/Lifetime host is unlimited regardless of this value (see
-- SubscriptionRepository.isUnderFreeLimitOrUnlimited's early return),
-- so it's dormant, not meaningless, for those rows.
--
-- NOT NULL with a default rather than nullable-for-unlimited: "0 or
-- unlimited" is already what `status = 'cancelled'`/an active paid
-- plan mean respectively — keeping session_limit strictly "how many
-- sessions this month" avoids overloading it with a second meaning.
-- CHECK >= 1 for the same reason: a host who should get zero belongs
-- in 'cancelled', not a 0 limit.
-- =============================================================
ALTER TABLE subscriptions
  ADD COLUMN session_limit INTEGER NOT NULL DEFAULT 1;

ALTER TABLE subscriptions
  ADD CONSTRAINT chk_session_limit_positive CHECK (session_limit >= 1);
